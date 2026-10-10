-- =====================================================================
-- 数据后台（v3）：访客采集 + 回执/留言站点归属 + 统计视图
-- 幂等，可重复执行。执行方式：
--   cloudbase db execute --sql "<单条>"
-- =====================================================================

-- ① 回执 / 留言补站点归属（多租户隔离必需；存量数据归到最早创建的站点）
alter table public.rsvps     add column if not exists site_id bigint;
alter table public.greetings add column if not exists site_id bigint;
-- 访客标识：把同一人的多次访问串起来（传播链），留言/回执带上后可显示姓名
alter table public.rsvps     add column if not exists vid varchar(24) not null default '';
alter table public.greetings add column if not exists vid varchar(24) not null default '';

update public.rsvps     set site_id = (select id from public.sites order by id limit 1) where site_id is null;
update public.greetings set site_id = (select id from public.sites order by id limit 1) where site_id is null;

create index if not exists rsvps_site_idx     on public.rsvps (site_id, created_at desc);
create index if not exists greetings_site_idx on public.greetings (site_id, created_at desc);

-- ② 访客表：一次进入一条；同人 5 分钟内重复进站不新增（云函数判重）
create table if not exists public.visits (
  id             bigserial primary key,
  site_id        bigint       not null,               -- 归属站点（哪对新人的请柬）
  openid         varchar(64)  not null default '',    -- 微信访客身份（UV 去重口径）
  vid            varchar(24)  not null default '',    -- 本访客稳定标识（分享来源用）
  from_vid       varchar(24)  not null default '',    -- 由谁转发进来（裂变链）
  via_share_code varchar(16)  not null default '',
  max_stage      smallint     not null default 0,     -- 浏览深度：最深看到第几幕 0..6
  created_at     timestamptz  not null default now(),
  updated_at     timestamptz  not null default now()
);

create index if not exists visits_site_time_idx   on public.visits (site_id, created_at desc);
create index if not exists visits_site_openid_idx on public.visits (site_id, openid);
create index if not exists visits_site_from_idx   on public.visits (site_id, from_vid);

alter table public.visits enable row level security;
revoke all on public.visits from anon;

-- ③ 统计视图（云函数以 service_role 读；anon 不给任何权限）
--
-- 口径说明（两条，都踩过）：
--   · **排除制作人自己的浏览**：新人做请柬时会反复打开预览，算进访客数纯属噪声。
--     判据 visits.openid = sites.owner_openid；用 `is distinct from` 才能把
--     openid 为空串的宾客正确算进来（`<>` 遇 NULL/空会漏人）。
--     注意制作人**仍会被记录**（他的 vid 要留着给分享路径当 from_vid 用），
--     只是在统计口径里被剔除；他自己转发带来的宾客照样归到他名下。
--   · **UV 用 `coalesce(nullif(openid,''), vid)`**：openid 列 not null default ''，
--     直接 count(distinct openid) 会把所有取不到身份的宾客塌成「一个人」。
--     退到 vid 口径后，每个匿名访客仍算独立访客。

-- 每日 PV / UV（按上海时区切天）
create or replace view public.visit_daily as
select v.site_id,
       (v.created_at at time zone 'Asia/Shanghai')::date as day,
       count(*)::int                                                  as pv,
       count(distinct coalesce(nullif(v.openid, ''), v.vid))::int      as uv
from public.visits v
join public.sites s on s.id = v.site_id
where v.openid is distinct from s.owner_openid
group by 1, 2;

-- 传播链：每个分享者（vid）带来的访客数
create or replace view public.visit_sources as
select v.site_id,
       v.from_vid,
       count(distinct coalesce(nullif(v.openid, ''), v.vid))::int as visitors
from public.visits v
join public.sites s on s.id = v.site_id
where v.from_vid <> ''
  and v.openid is distinct from s.owner_openid
group by 1, 2;

-- 浏览深度分布：看到第 N 幕的访客数
create or replace view public.visit_depth as
select v.site_id,
       v.max_stage,
       count(distinct coalesce(nullif(v.openid, ''), v.vid))::int as visitors
from public.visits v
join public.sites s on s.id = v.site_id
where v.openid is distinct from s.owner_openid
group by 1, 2;

-- 回执汇总
create or replace view public.rsvp_summary as
select site_id,
       count(*)::int                                                    as total,
       count(*) filter (where attending)::int                            as attending,
       count(*) filter (where not attending)::int                        as absent,
       coalesce(sum(case when attending then guest_count else 0 end), 0)::int as guests
from public.rsvps
group by 1;

-- 留言数
create or replace view public.greeting_stats as
select site_id, count(*)::int as total
from public.greetings
group by 1;

-- 站点级概览（一次拿四个数字）；PV/UV 同样排除制作人自己的浏览
create or replace view public.site_stats as
select s.id as site_id,
       coalesce((select count(*) from public.visits v
                  where v.site_id = s.id and v.openid is distinct from s.owner_openid), 0)::int as pv,
       coalesce((select count(distinct coalesce(nullif(v.openid, ''), v.vid)) from public.visits v
                  where v.site_id = s.id and v.openid is distinct from s.owner_openid), 0)::int as uv,
       coalesce((select count(*) from public.greetings g where g.site_id = s.id), 0)::int as greetings,
       coalesce((select count(*) from public.rsvps r where r.site_id = s.id), 0)::int     as rsvps
from public.sites s;

revoke all on public.visit_daily, public.visit_sources, public.visit_depth,
              public.rsvp_summary, public.greeting_stats, public.site_stats from anon;

-- ④ 旧全局视图退役：由 rsvp_summary（带 site_id）承接，getRsvpCount 改查新视图
drop view if exists public.rsvp_stats;

-- ⑤ 宾客端最小授权（这些函数用 rdb 默认身份 = anon）
--    · submitRsvp/submitGreeting/listGreetings/getRsvpCount 需要把 share_code 解析成站点 id
--    · getRsvpCount 需要读回执汇总（只暴露数字，不含手机号等隐私）
--    只给两列 + 只给已发布站点，请柬内容本身仍然只经云函数中转
drop policy if exists sites_code_read on public.sites;
create policy sites_code_read on public.sites
  for select to anon using (status = 'published');
grant select (id, share_code) on public.sites to anon;
grant select on public.rsvp_summary to anon;
