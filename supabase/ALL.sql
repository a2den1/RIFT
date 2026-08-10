-- =========================================================
-- RIFT — 전체 설치 SQL (이 파일 하나만 실행하면 됩니다)
--
-- 쓰는 법
--   Supabase → SQL Editor → New query
--   이 파일 내용을 전부 붙여넣고 Run (Ctrl+Enter)
--
-- 여러 번 실행해도 안전합니다. 기존 데이터는 지워지지 않습니다.
-- 실행 후 관리자 페이지의 "설정 점검" 이 모두 ✅ 가 되면 정상입니다.
-- =========================================================


-- =========================================================
-- 1. 테이블
-- =========================================================

-- 관리자
create table if not exists public.admins (
  id                uuid primary key default gen_random_uuid(),
  discord_username  text unique not null,
  discord_id        text,
  created_at        timestamptz not null default now()
);
alter table public.admins add column if not exists discord_id text;

insert into public.admins (discord_username) values ('_a2den.')
on conflict (discord_username) do nothing;

-- 공지
create table if not exists public.notices (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  body        text,
  image_url   text,
  created_at  timestamptz not null default now()
);

-- 이벤트
create table if not exists public.events (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  body        text,
  starts_at   date not null,
  ends_at     date,
  created_at  timestamptz not null default now()
);

-- 경기
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

-- 구단
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
alter table public.clubs add column if not exists logo_url   text;
alter table public.clubs add column if not exists owner_id   uuid;
alter table public.clubs add column if not exists funds      bigint not null default 0;
alter table public.clubs add column if not exists created_at timestamptz not null default now();

-- 선수 (마인크래프트 플러그인이 채웁니다)
create table if not exists public.players (
  id          uuid primary key default gen_random_uuid(),
  name        text unique not null,
  job         text,
  club        text,
  kills       int not null default 0,
  deaths      int not null default 0,
  playtime    int not null default 0,   -- 시간 단위
  money       bigint not null default 0,
  bounty      bigint not null default 0
);

-- 접속자 수 (플러그인이 갱신)
create table if not exists public.server_status (
  id            int primary key default 1,
  online_count  int not null default 0,
  updated_at    timestamptz not null default now(),
  constraint server_status_single_row check (id = 1)
);

-- 사이트 이미지
create table if not exists public.site_images (
  key         text primary key,
  url         text not null,
  updated_at  timestamptz not null default now()
);

-- 탭 잠금
create table if not exists public.tab_locks (
  page        text primary key,
  locked      boolean not null default false,
  reason      text,
  updated_at  timestamptz not null default now()
);
insert into public.tab_locks (page, locked) values
  ('index', false), ('play', false), ('guide', false),
  ('league', false), ('ranking', false), ('support', false)
on conflict (page) do nothing;

-- 프로필
create table if not exists public.profiles (
  id               uuid primary key references auth.users(id) on delete cascade,
  discord_username text,
  mc_name          text,
  pronouns         text,
  bio              text,
  job              text,
  club             text,
  xp               int  not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create unique index if not exists profiles_mc_name_key
  on public.profiles (lower(mc_name)) where mc_name is not null;

-- 이적 신청
create table if not exists public.transfers (
  id          uuid primary key default gen_random_uuid(),
  player_id   uuid not null references auth.users(id) on delete cascade,
  player_name text,
  from_club   text,
  to_club     text not null,
  note        text,
  status      text not null default 'pending',
  created_at  timestamptz not null default now(),
  decided_at  timestamptz,
  decided_by  text
);
create index if not exists transfers_to_club_idx on public.transfers (to_club, status);


-- =========================================================
-- 2. 권한 판정 함수
--    정책보다 먼저 만들어야 합니다.
-- =========================================================

-- 디스코드 사용자명 정규화 (소문자 + 뒤쪽 #0 제거)
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

create or replace function public.current_discord_id()
returns text language sql stable as $$
  select coalesce(
    auth.jwt() -> 'user_metadata' ->> 'provider_id',
    auth.jwt() -> 'user_metadata' ->> 'sub'
  );
$$;

-- security definer 라서 admins 테이블 정책과 재귀하지 않습니다.
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.admins a
    where public.norm_discord(a.discord_username) = public.norm_discord(public.current_discord_username())
       or (a.discord_id is not null and a.discord_id = public.current_discord_id())
  );
$$;

-- 관리자 페이지 진단용
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
-- 3. RLS — 읽기는 누구나, 쓰기는 관리자만
-- =========================================================
alter table public.admins        enable row level security;
alter table public.notices       enable row level security;
alter table public.events        enable row level security;
alter table public.matches       enable row level security;
alter table public.clubs         enable row level security;
alter table public.players       enable row level security;
alter table public.server_status enable row level security;
alter table public.site_images   enable row level security;
alter table public.tab_locks     enable row level security;
alter table public.profiles      enable row level security;
alter table public.transfers     enable row level security;

do $$
declare t text;
begin
  foreach t in array array['notices','events','matches','clubs','players',
                           'server_status','site_images','tab_locks'] loop
    execute format('drop policy if exists "%s_read"  on public.%I', t, t);
    execute format('drop policy if exists "%s_write" on public.%I', t, t);
    execute format('create policy "%s_read" on public.%I for select using (true)', t, t);
    execute format(
      'create policy "%s_write" on public.%I for all to authenticated
         using (public.is_admin()) with check (public.is_admin())', t, t);
  end loop;
end $$;

-- admins 는 로그인한 사용자만 읽고, 관리자만 수정
drop policy if exists "admins_read"  on public.admins;
drop policy if exists "admins_write" on public.admins;
create policy "admins_read"  on public.admins for select to authenticated using (true);
create policy "admins_write" on public.admins for all    to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- 프로필: 본인 것만 수정. xp 와 club 은 아래 GRANT 로 아예 막습니다.
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to anon, authenticated;
grant insert (id, discord_username, mc_name, pronouns, bio, job) on public.profiles to authenticated;
grant update (discord_username, mc_name, pronouns, bio, job, updated_at) on public.profiles to authenticated;

drop policy if exists "profiles_read"        on public.profiles;
drop policy if exists "profiles_insert_self" on public.profiles;
drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_read"        on public.profiles for select using (true);
create policy "profiles_insert_self" on public.profiles for insert to authenticated with check (id = auth.uid());
create policy "profiles_update_self" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- 이적 신청
drop policy if exists "transfers_read"   on public.transfers;
drop policy if exists "transfers_insert" on public.transfers;
drop policy if exists "transfers_admin"  on public.transfers;
create policy "transfers_read"   on public.transfers for select using (true);
create policy "transfers_insert" on public.transfers for insert to authenticated
  with check (player_id = auth.uid() and status = 'pending');
create policy "transfers_admin"  on public.transfers for all to authenticated
  using (public.is_admin()) with check (public.is_admin());


-- =========================================================
-- 4. 이미지 파일 업로드용 스토리지
-- =========================================================
insert into storage.buckets (id, name, public)
values ('site', 'site', true)
on conflict (id) do update set public = true;

drop policy if exists "site_read"   on storage.objects;
drop policy if exists "site_insert" on storage.objects;
drop policy if exists "site_update" on storage.objects;
drop policy if exists "site_delete" on storage.objects;

create policy "site_read"   on storage.objects for select using (bucket_id = 'site');
create policy "site_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'site' and public.is_admin());
create policy "site_update" on storage.objects for update to authenticated
  using (bucket_id = 'site' and public.is_admin())
  with check (bucket_id = 'site' and public.is_admin());
create policy "site_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'site' and public.is_admin());


-- =========================================================
-- 5. 구단 생성 · 이적 함수
--    규칙을 화면이 아니라 여기서 강제합니다.
-- =========================================================
create or replace function public.create_club(p_name text, p_logo text)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_uid  uuid := auth.uid();
  v_prof public.profiles%rowtype;
begin
  if v_uid is null then
    return json_build_object('ok', false, 'error', '로그인이 필요합니다.');
  end if;

  select * into v_prof from public.profiles where id = v_uid;
  if not found or coalesce(v_prof.mc_name, '') = '' then
    return json_build_object('ok', false, 'error', '먼저 마인크래프트 닉네임을 등록해 주세요.');
  end if;
  if coalesce(v_prof.job, '') = '' then
    return json_build_object('ok', false, 'error', '먼저 직업을 선택해 주세요.');
  end if;
  if coalesce(v_prof.club, '') <> '' then
    return json_build_object('ok', false, 'error', '이미 소속된 구단이 있습니다.');
  end if;
  if coalesce(p_logo, '') = '' then
    return json_build_object('ok', false, 'error', '구단 로고를 올려 주세요.');
  end if;

  p_name := btrim(coalesce(p_name, ''));
  if char_length(p_name) < 2 or char_length(p_name) > 16 then
    return json_build_object('ok', false, 'error', '구단 이름은 2~16자여야 합니다.');
  end if;
  if exists (select 1 from public.clubs where lower(name) = lower(p_name)) then
    return json_build_object('ok', false, 'error', '이미 같은 이름의 구단이 있습니다.');
  end if;
  if exists (select 1 from public.clubs where owner_id = v_uid) then
    return json_build_object('ok', false, 'error', '이미 구단을 보유하고 있습니다.');
  end if;

  insert into public.clubs (name, owner, owner_id, logo_url, roster)
  values (p_name, v_prof.mc_name, v_uid, p_logo, 1);
  update public.profiles set club = p_name, updated_at = now() where id = v_uid;

  return json_build_object('ok', true, 'name', p_name);
end $$;

create or replace function public.request_transfer(p_club text, p_note text)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_uid  uuid := auth.uid();
  v_prof public.profiles%rowtype;
begin
  if v_uid is null then
    return json_build_object('ok', false, 'error', '로그인이 필요합니다.');
  end if;
  select * into v_prof from public.profiles where id = v_uid;
  if not found or coalesce(v_prof.mc_name, '') = '' then
    return json_build_object('ok', false, 'error', '먼저 마인크래프트 닉네임을 등록해 주세요.');
  end if;
  if not exists (select 1 from public.clubs where name = p_club) then
    return json_build_object('ok', false, 'error', '그런 구단이 없습니다.');
  end if;
  if coalesce(v_prof.club, '') = p_club then
    return json_build_object('ok', false, 'error', '이미 그 구단 소속입니다.');
  end if;
  if exists (select 1 from public.transfers where player_id = v_uid and status = 'pending') then
    return json_build_object('ok', false, 'error', '이미 처리 대기 중인 신청이 있습니다.');
  end if;

  insert into public.transfers (player_id, player_name, from_club, to_club, note)
  values (v_uid, v_prof.mc_name, nullif(v_prof.club, ''), p_club, nullif(btrim(coalesce(p_note, '')), ''));
  return json_build_object('ok', true);
end $$;

create or replace function public.decide_transfer(p_id uuid, p_accept boolean)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_t   public.transfers%rowtype;
  v_own uuid;
begin
  if v_uid is null then
    return json_build_object('ok', false, 'error', '로그인이 필요합니다.');
  end if;
  select * into v_t from public.transfers where id = p_id;
  if not found or v_t.status <> 'pending' then
    return json_build_object('ok', false, 'error', '이미 처리된 신청입니다.');
  end if;

  select owner_id into v_own from public.clubs where name = v_t.to_club;
  if v_own is distinct from v_uid and not public.is_admin() then
    return json_build_object('ok', false, 'error', '해당 구단의 구단주만 처리할 수 있습니다.');
  end if;

  update public.transfers
     set status = case when p_accept then 'accepted' else 'rejected' end,
         decided_at = now(), decided_by = public.current_discord_username()
   where id = p_id;

  if p_accept then
    if v_t.from_club is not null then
      update public.clubs set roster = greatest(roster - 1, 0) where name = v_t.from_club;
    end if;
    update public.clubs set roster = roster + 1 where name = v_t.to_club;
    update public.profiles set club = v_t.to_club, updated_at = now() where id = v_t.player_id;
  end if;

  return json_build_object('ok', true);
end $$;

create or replace function public.leave_club()
returns json language plpgsql security definer set search_path = public as $$
declare
  v_uid  uuid := auth.uid();
  v_prof public.profiles%rowtype;
begin
  if v_uid is null then
    return json_build_object('ok', false, 'error', '로그인이 필요합니다.');
  end if;
  select * into v_prof from public.profiles where id = v_uid;
  if coalesce(v_prof.club, '') = '' then
    return json_build_object('ok', false, 'error', '소속된 구단이 없습니다.');
  end if;
  if exists (select 1 from public.clubs where name = v_prof.club and owner_id = v_uid) then
    return json_build_object('ok', false, 'error', '구단주는 탈퇴할 수 없습니다. 관리자에게 문의해 주세요.');
  end if;

  update public.clubs set roster = greatest(roster - 1, 0) where name = v_prof.club;
  update public.profiles set club = null, updated_at = now() where id = v_uid;
  return json_build_object('ok', true);
end $$;

create or replace function public.set_club_logo(p_logo text)
returns json language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return json_build_object('ok', false, 'error', '로그인이 필요합니다.');
  end if;
  if coalesce(p_logo, '') = '' then
    return json_build_object('ok', false, 'error', '로고 주소가 비어 있습니다.');
  end if;
  update public.clubs set logo_url = p_logo where owner_id = v_uid;
  if not found then
    return json_build_object('ok', false, 'error', '보유한 구단이 없습니다.');
  end if;
  return json_build_object('ok', true);
end $$;



-- =========================================================
-- 6. 마인크래프트 닉네임 인게임 인증
--    사이트에서 코드를 받고 게임 안에서 /웹인증 <코드> 를 쳐야
--    닉네임이 등록됩니다.
-- =========================================================
create table if not exists public.mc_verifications (
  code       text primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  used_at    timestamptz,
  mc_name    text
);
create index if not exists mc_verifications_user_idx on public.mc_verifications (user_id, used_at);

alter table public.profiles add column if not exists mc_uuid        text;
alter table public.profiles add column if not exists mc_verified_at timestamptz;

-- =========================================================
-- 닉네임은 더 이상 브라우저에서 고칠 수 없습니다.
-- 아래 GRANT 목록에서 mc_name 을 뺐습니다.
-- 이제 redeem_mc_code() 만 닉네임을 씁니다.
-- =========================================================
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to anon, authenticated;
grant insert (id, discord_username, pronouns, bio, job) on public.profiles to authenticated;
grant update (discord_username, pronouns, bio, job, updated_at) on public.profiles to authenticated;

alter table public.mc_verifications enable row level security;
drop policy if exists "mcv_read_own" on public.mc_verifications;
create policy "mcv_read_own" on public.mc_verifications
  for select to authenticated using (user_id = auth.uid());


-- =========================================================
-- 사이트: 인증 코드 발급
-- =========================================================
create or replace function public.request_mc_code()
returns json language plpgsql security definer set search_path = public as $$
declare
  v_uid  uuid := auth.uid();
  v_code text;
begin
  if v_uid is null then
    return json_build_object('ok', false, 'error', '로그인이 필요합니다.');
  end if;

  -- 아직 안 쓴 예전 코드는 버립니다. 한 사람당 유효한 코드는 하나뿐입니다.
  delete from public.mc_verifications where user_id = v_uid and used_at is null;

  -- 헷갈리는 글자(0 O 1 I)를 뺀 6자리
  loop
    select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
                             floor(random() * 32)::int + 1, 1), '')
      into v_code
      from generate_series(1, 6);
    exit when not exists (select 1 from public.mc_verifications where code = v_code);
  end loop;

  insert into public.mc_verifications (code, user_id) values (v_code, v_uid);
  return json_build_object('ok', true, 'code', v_code, 'expires_in', 600);
end $$;

revoke all on function public.request_mc_code() from public, anon;
grant execute on function public.request_mc_code() to authenticated;


-- =========================================================
-- 플러그인: 코드 확인 후 닉네임 연결
-- 서버(service_role)만 호출할 수 있습니다.
-- 그래야 코드를 무작위로 대입해 남의 계정에 붙이는 걸 막을 수 있습니다.
-- =========================================================
create or replace function public.redeem_mc_code(p_code text, p_name text, p_uuid text)
returns json language plpgsql security definer set search_path = public as $$
declare v public.mc_verifications%rowtype;
begin
  if coalesce(btrim(p_name), '') = '' then
    return json_build_object('ok', false, 'error', '닉네임이 비어 있습니다.');
  end if;

  select * into v from public.mc_verifications where code = upper(btrim(p_code));
  if not found then
    return json_build_object('ok', false, 'error', '없는 코드입니다.');
  end if;
  if v.used_at is not null then
    return json_build_object('ok', false, 'error', '이미 사용된 코드입니다.');
  end if;
  if v.expires_at < now() then
    return json_build_object('ok', false, 'error', '만료된 코드입니다. 사이트에서 다시 발급해 주세요.');
  end if;
  if exists (select 1 from public.profiles
              where lower(mc_name) = lower(btrim(p_name)) and id <> v.user_id) then
    return json_build_object('ok', false, 'error', '이미 다른 계정에 연결된 닉네임입니다.');
  end if;

  update public.mc_verifications
     set used_at = now(), mc_name = btrim(p_name)
   where code = v.code;

  update public.profiles
     set mc_name = btrim(p_name), mc_uuid = p_uuid,
         mc_verified_at = now(), updated_at = now()
   where id = v.user_id;

  return json_build_object('ok', true, 'name', btrim(p_name));
end $$;

revoke all on function public.redeem_mc_code(text, text, text) from public, anon, authenticated;
grant execute on function public.redeem_mc_code(text, text, text) to service_role;


-- =========================================================
-- 7. 마무리
--    새로 만든 테이블과 함수를 API 가 바로 인식하게 캐시를 갱신합니다.
--    이걸 빠뜨리면 "테이블을 찾을 수 없다"는 오류가 납니다.
-- =========================================================
notify pgrst, 'reload schema';

-- 확인용 — admins 에 무엇이 들어 있는지 보여줍니다.
select discord_username, public.norm_discord(discord_username) as 정규화, discord_id
from public.admins;
