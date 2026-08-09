-- =========================================================
-- RIFT — Supabase 스키마
-- Supabase 대시보드 → SQL Editor 에 붙여넣고 실행하세요.
-- =========================================================

-- ---------- 관리자 ----------
create table if not exists public.admins (
  id                uuid primary key default gen_random_uuid(),
  discord_username  text unique not null,
  discord_id        text,
  created_at        timestamptz not null default now()
);
-- 이전 버전에서 만든 테이블에도 컬럼을 추가합니다.
alter table public.admins add column if not exists discord_id text;

-- 최초 관리자
insert into public.admins (discord_username)
values ('_a2den.')
on conflict (discord_username) do nothing;

-- ---------- 콘텐츠 ----------
create table if not exists public.notices (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  body        text,
  image_url   text,
  created_at  timestamptz not null default now()
);

create table if not exists public.events (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  body        text,
  starts_at   date not null,
  ends_at     date,
  created_at  timestamptz not null default now()
);

create table if not exists public.matches (
  id          uuid primary key default gen_random_uuid(),
  home        text not null,
  away        text not null,
  starts_at   timestamptz not null,
  map         text,
  image_url   text,
  home_score  int,
  away_score  int,
  status      text not null default 'scheduled',
  created_at  timestamptz not null default now()
);

create table if not exists public.clubs (
  id          uuid primary key default gen_random_uuid(),
  name        text unique not null,
  owner       text,
  roster      int  not null default 0,
  games       int  not null default 0,
  wins        int  not null default 0,
  losses      int  not null default 0,
  set_diff    text,
  reputation  int  not null default 0,
  titles      int  not null default 0
);

create table if not exists public.players (
  id          uuid primary key default gen_random_uuid(),
  name        text unique not null,
  job         text,
  club        text,
  kills       int not null default 0,
  deaths      int not null default 0,
  playtime    int not null default 0,   -- 시간
  money       bigint not null default 0,
  bounty      bigint not null default 0
);

-- 접속자 수. 마인크래프트 서버가 주기적으로 갱신합니다.
-- 행이 없으면 사이트에서 접속자 수 표시를 숨깁니다.
create table if not exists public.server_status (
  id            int primary key default 1,
  online_count  int not null default 0,
  updated_at    timestamptz not null default now(),
  constraint server_status_single_row check (id = 1)
);

-- =========================================================
-- 권한 판정
-- security definer 로 두어야 admins 테이블 정책과 재귀하지 않습니다.
-- =========================================================
-- 디스코드 사용자명은 프로바이더에 따라 `_a2den.`, `_a2den.#0` 등으로 들어옵니다.
-- 비교할 때는 소문자로 바꾸고 `#0` 을 떼어 정규화합니다.
create or replace function public.norm_discord(s text)
returns text language sql immutable as $$
  select regexp_replace(lower(coalesce(s, '')), '#0$', '');
$$;

create or replace function public.current_discord_username()
returns text language sql stable as $$
  select coalesce(
    auth.jwt() -> 'user_metadata' ->> 'preferred_username',
    auth.jwt() -> 'user_metadata' ->> 'user_name',
    auth.jwt() -> 'user_metadata' ->> 'name',
    auth.jwt() -> 'user_metadata' ->> 'full_name',
    auth.jwt() -> 'user_metadata' -> 'custom_claims' ->> 'global_name'
  );
$$;

-- 사용자명은 바뀔 수 있으니 디스코드 고유 ID 로도 대조합니다.
create or replace function public.current_discord_id()
returns text language sql stable as $$
  select coalesce(
    auth.jwt() -> 'user_metadata' ->> 'provider_id',
    auth.jwt() -> 'user_metadata' ->> 'sub'
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admins a
    where public.norm_discord(a.discord_username) = public.norm_discord(public.current_discord_username())
       or (a.discord_id is not null and a.discord_id = public.current_discord_id())
  );
$$;

-- 진단용. 관리자 페이지에서 호출해 DB가 나를 어떻게 보는지 확인합니다.
create or replace function public.whoami()
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'username',      public.current_discord_username(),
    'normalized',    public.norm_discord(public.current_discord_username()),
    'discord_id',    public.current_discord_id(),
    'is_admin',      public.is_admin(),
    'jwt_role',      auth.jwt() ->> 'role',
    'user_metadata', auth.jwt() -> 'user_metadata'
  );
$$;

-- =========================================================
-- RLS — 읽기는 전체 공개, 쓰기는 관리자만
-- =========================================================
alter table public.admins        enable row level security;
alter table public.notices       enable row level security;
alter table public.events        enable row level security;
alter table public.matches       enable row level security;
alter table public.clubs         enable row level security;
alter table public.players       enable row level security;
alter table public.server_status enable row level security;

do $$
declare t text;
begin
  foreach t in array array['notices','events','matches','clubs','players','server_status'] loop
    execute format('drop policy if exists "%s_read"  on public.%I', t, t);
    execute format('drop policy if exists "%s_write" on public.%I', t, t);
    execute format('create policy "%s_read" on public.%I for select using (true)', t, t);
    execute format(
      'create policy "%s_write" on public.%I for all to authenticated
         using (public.is_admin()) with check (public.is_admin())', t, t);
  end loop;
end $$;

-- admins 는 로그인한 사용자만 읽고, 관리자만 수정할 수 있습니다.
drop policy if exists "admins_read"  on public.admins;
drop policy if exists "admins_write" on public.admins;
create policy "admins_read"  on public.admins for select to authenticated using (true);
create policy "admins_write" on public.admins for all    to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- =========================================================
-- 샘플 데이터 (선택)
-- =========================================================
insert into public.clubs (name, owner, roster, games, wins, losses, set_diff, reputation, titles) values
  ('NOVA','Vellum',14,12,10,2,'+13',8420,2),
  ('BLACKOUT','Drex',13,12,9,3,'+10',7910,1),
  ('SPECTRA','Kuro',12,12,7,5,'+3',6240,1),
  ('IRONVEIL','Nine',12,12,6,6,'+1',5580,0),
  ('KRONOS','Halcyon',12,12,5,7,'-4',4730,0),
  ('ASHFALL','Miro',12,12,3,9,'-11',3160,0)
on conflict (name) do nothing;

insert into public.players (name, job, club, kills, deaths, playtime, money, bounty) values
  ('Aiden','공격수','NOVA',412,96,389,15970000,4200000),
  ('Ravenz','원거리','BLACKOUT',388,110,241,18420000,2480000),
  ('Kuro','공격수','SPECTRA',351,124,310,9120000,3150000),
  ('Vellum','탱커','NOVA',297,141,412,8650000,0),
  ('Nine','원거리','IRONVEIL',284,103,338,7430000,1140000),
  ('Halcyon','서포터','KRONOS',221,88,361,10880000,0),
  ('Drex','탱커','BLACKOUT',198,132,287,12340000,1720000),
  ('Miro','공격수','ASHFALL',176,95,264,6010000,860000)
on conflict (name) do nothing;
