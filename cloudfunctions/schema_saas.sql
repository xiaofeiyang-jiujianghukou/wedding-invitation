-- =====================================================================
-- 多租户版婚礼请柬 · 数据层（v2）
-- 在控制台「SQL 型数据库 → SQL 编辑器」里整段粘贴执行（幂等）
--
-- 设计要点：
--   · 一行 = 一对新人（租户），用 owner_openid 唯一标识，天然隔离
--   · share_code 用于宾客端访问（宾客不带 openid，靠分享码定位新人）
--   · 差量更新：content_hash 记录每部分内容的指纹，未变则跳过 AI/压缩
-- =====================================================================

-- ① 新人主体表：每个新人一行，openid 唯一
create table if not exists public.sites (
  id             bigserial primary key,
  -- 小程序 openid（云函数自动注入，可信、不可伪造）
  owner_openid   varchar(64)  not null unique,
  -- 分享码：宾客扫码/点链接时用它定位是哪对新人的请柬
  share_code     varchar(16)  not null unique,
  -- 新人信息、故事、排程、尾幕等（不含照片，照片单独存以便差量处理）
  profile        jsonb        not null default '{}'::jsonb,
  -- 配乐：storage_key / public_url / title / mood
  music          jsonb        not null default '{}'::jsonb,
  -- 差量指纹：{ profile: "md5", music: "md5" }，变了才重算相关部分
  hashes         jsonb        not null default '{}'::jsonb,
  -- 发布状态：draft（未发布，宾客看不到）/ published（宾客可见）
  status         varchar(16)  not null default 'draft',
  created_at     timestamptz  not null default now(),
  updated_at     timestamptz  not null default now()
);

create index if not exists sites_share_code_idx on public.sites (share_code);
create index if not exists sites_owner_idx on public.sites (owner_openid);

-- ② 照片表：按 openid 归属，支持单张差量重处理
create table if not exists public.photos (
  id             bigserial primary key,
  owner_openid   varchar(64)  not null,
  -- 云存储对象 key（形如 sites/{openid}/p01.jpg）
  storage_key    varchar(255) not null,
  public_url     text         not null default '',
  -- 原始文件指纹：图没换就不重新压缩、不重新 AI 分析
  source_hash    varchar(64)  not null default '',
  -- 压缩后体积（体积守门）
  bytes          int          not null default 0,
  width          int          not null default 0,
  height         int          not null default 0,
  -- 相册顺序（后台拖拽）
  sort_order     int          not null default 0,
  -- AI 分析结果 + 人工审阅覆盖值
  ai             jsonb,
  reviewed       jsonb,
  -- 状态：uploaded → analyzed → approved（approved 才对外可见）
  status         varchar(16)  not null default 'uploaded',
  created_at     timestamptz  not null default now(),
  updated_at     timestamptz  not null default now()
);

create index if not exists photos_owner_sort_idx
  on public.photos (owner_openid, sort_order, id);
create unique index if not exists photos_owner_key_uniq
  on public.photos (owner_openid, storage_key);

-- ③ 配乐库：内置曲库（owner_openid 为空）+ 用户上传
create table if not exists public.music_lib (
  id             bigserial primary key,
  owner_openid   varchar(64),          -- 空 = 内置公共曲库
  title          varchar(80)  not null,
  mood           varchar(32)  not null default 'romantic',
  storage_key    varchar(255) not null default '',
  public_url     text         not null default '',
  duration_s     int          not null default 0,
  created_at     timestamptz  not null default now()
);

-- =====================================================================
-- 权限边界
--   云函数以 service_role（API Key）访问，绕过 RLS 做全部读写 —— 后台唯一入口
--   anon（宾客端）**不给任何表权限**：宾客数据一律经云函数中转，
--   这样「哪个 share_code 看哪对新人的请柬」由云函数判定，不会越权。
-- =====================================================================
alter table public.sites     enable row level security;
alter table public.photos    enable row level security;
alter table public.music_lib enable row level security;

-- anon 什么都不给（默认拒绝）
revoke all on public.sites     from anon;
revoke all on public.photos    from anon;
revoke all on public.music_lib from anon;
