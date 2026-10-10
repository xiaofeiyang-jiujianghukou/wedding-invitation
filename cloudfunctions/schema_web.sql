-- =====================================================================
-- PC 端（网页）扫码登录会话表
--   流程：网页 create → 出小程序码 → 用户微信扫码 → 小程序 confirm
--         → 网页 poll 取回 token → 带 token 调 adminManage
--   仅 service_role（云函数）可访问；anon / authenticated 一律无权。
-- =====================================================================

create table if not exists public.web_sessions (
  scene       varchar(32) primary key,          -- 一次性随机串，写进小程序码的 scene
  secret_hash varchar(64) not null,             -- 网页持有的 secret 的 sha256（防 scene 泄露被换 token）
  status      varchar(12) not null default 'pending',  -- pending / confirmed
  token       varchar(64),                      -- 确认后签发，网页轮询取走
  site_id     bigint,                           -- 确认者名下的站点
  openid      varchar(64),                      -- 确认者（便于审计）
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null              -- pending 时=扫码窗口；confirmed 后=登录有效期
);

create index if not exists web_sessions_expires_idx on public.web_sessions (expires_at);
create index if not exists web_sessions_token_idx   on public.web_sessions (token);

-- 收紧权限：默认 RLS 开 + 不建任何 policy ⇒ 除 service_role 外无人可读
alter table public.web_sessions enable row level security;
revoke all on public.web_sessions from anon;
revoke all on public.web_sessions from authenticated;

-- 顺手清理过期会话（幂等，可重复执行）
delete from public.web_sessions where expires_at < now() - interval '1 day';
