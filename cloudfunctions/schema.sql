-- 在控制台「SQL 型数据库 → SQL 编辑器」里整段粘贴执行

create table if not exists rsvps (
  id           bigserial primary key,
  name         varchar(20)  not null,
  phone        varchar(20)  not null default '',
  attending    boolean      not null default true,
  guest_count  smallint     not null default 1 check (guest_count between 1 and 10),
  note         varchar(100) not null default '',
  created_at   timestamptz  not null default now()
);

create table if not exists greetings (
  id          bigserial primary key,
  name        varchar(20)  not null,
  text        varchar(100) not null,
  created_at  timestamptz  not null default now()
);

create index if not exists greetings_created_at_idx on greetings (created_at desc);

-- 云函数与浏览器匿名用户同为 anon 角色，安全边界由 GRANT + RLS 承担：
--   greetings 可插可读；rsvps 只能插，行数据（含手机号）对外不可读，总数经视图暴露。
alter table rsvps enable row level security;
alter table greetings enable row level security;

grant select, insert on public.greetings to anon;
grant usage, select on sequence public.greetings_id_seq to anon;
create policy greetings_insert on public.greetings for insert to anon with check (true);
create policy greetings_select on public.greetings for select to anon using (true);

grant insert on public.rsvps to anon;
grant usage, select on sequence public.rsvps_id_seq to anon;
create policy rsvps_insert on public.rsvps for insert to anon with check (true);

create or replace view public.rsvp_stats as select count(*)::int as total from public.rsvps;
grant select on public.rsvp_stats to anon;
