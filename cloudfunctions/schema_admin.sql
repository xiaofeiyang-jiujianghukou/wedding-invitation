-- =====================================================================
-- 通用婚礼请柬后台 · 数据层
-- 在控制台「SQL 型数据库 → SQL 编辑器」里整段粘贴执行（幂等，可重复跑）
-- =====================================================================

-- ① 请柬配置表：后台编辑的全部内容存这里，单行（id 恒为 1）
--    小程序端只读该表渲染，因此后台改内容 = 宾客端刷新即见，无需重新发版
create table if not exists public.wedding_config (
  id          smallint primary key default 1 check (id = 1),
  -- 新人信息、故事、相册、音乐、排程等，整体存 JSONB（已发布，宾客可见）
  payload     jsonb        not null default '{}'::jsonb,
  -- 草稿态：AI 处理结果与后台未发布的编辑先落这里，人工确认后才覆盖到 payload
  draft       jsonb,
  -- 后台登录会话（token 哈希 + 过期时间），独立字段避免与 draft 互相覆盖
  session     jsonb,
  updated_at  timestamptz  not null default now()
);

-- 兼容旧表结构（若已建过则补列）
alter table public.wedding_config add column if not exists session jsonb;

-- 单行约束：确保只有一行配置
insert into public.wedding_config (id, payload)
values (1, '{}'::jsonb)
on conflict (id) do nothing;

-- ② 照片表：记录每张照片的云存储地址、AI 分析结果、审阅状态
create table if not exists public.wedding_photos (
  id           bigserial primary key,
  -- 云存储对象 key（如 photos/xxx.jpg）
  storage_key  varchar(255) not null unique,
  -- 公读 URL（便于前端直显）
  public_url   text         not null default '',
  -- 排序位（相册顺序由后台拖拽决定）
  sort_order   int          not null default 0,
  -- 字节数（体积守门用）
  bytes        int          not null default 0,
  width        int          not null default 0,
  height       int          not null default 0,
  -- AI 分析结果：caption / chapter / dir / fx / kaleido + 置信度
  ai           jsonb,
  -- 人工审阅后的最终值（后台可覆盖 AI）
  reviewed     jsonb,
  -- 状态机：uploaded → analyzed → approved（approved 才进正式配置）
  status       varchar(16)  not null default 'uploaded',
  created_at   timestamptz  not null default now()
);

create index if not exists wedding_photos_sort_idx
  on public.wedding_photos (sort_order, id);

-- ③ 配乐表：内置曲库 + 用户上传，后台选用
create table if not exists public.wedding_music (
  id          bigserial primary key,
  title       varchar(80)  not null,
  -- 风格标签：romantic / fresh / vintage / cinematic ...
  mood        varchar(32)  not null default 'romantic',
  storage_key varchar(255) not null default '',
  public_url  text         not null default '',
  duration_s  int          not null default 0,
  is_builtin  boolean      not null default false,
  created_at  timestamptz  not null default now()
);

-- =====================================================================
-- 权限边界：后台配置是「制作者私有」，宾客只能看渲染后的请柬
--   · anon（浏览器匿名 / 宾客端小程序）→ 只读 wedding_config.payload
--   · 云函数一律以 service 角色访问 rdb，绕过 RLS 进行管理写操作
-- =====================================================================
alter table public.wedding_config enable row level security;
alter table public.wedding_photos enable row level security;
alter table public.wedding_music  enable row level security;

-- 宾客只读「已发布配置」；草稿列根本不给 anon 任何权限
grant select on public.wedding_config to anon;
drop policy if exists wedding_config_read on public.wedding_config;
create policy wedding_config_read on public.wedding_config
  for select to anon using (true);

-- 照片元信息可读（宾客端要知道有哪些照片、顺序、文案）
grant select on public.wedding_photos to anon;
drop policy if exists wedding_photos_read on public.wedding_photos;
create policy wedding_photos_read on public.wedding_photos
  for select to anon using (status = 'approved');

-- anon 对照片表**不可写**（无 insert/update/delete grant）——这是关键防线
revoke insert, update, delete on public.wedding_photos from anon;

-- 配乐库可读，不可写
grant select on public.wedding_music to anon;
drop policy if exists wedding_music_read on public.wedding_music;
create policy wedding_music_read on public.wedding_music
  for select to anon using (true);
revoke insert, update, delete on public.wedding_music from anon;

-- anon 绝不可改配置
revoke insert, update, delete on public.wedding_config from anon;
