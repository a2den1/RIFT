-- =========================================================
-- 프로필 · 구단 생성 · 이적
-- SQL Editor 에 붙여넣고 Run 하세요. 여러 번 실행해도 안전합니다.
-- fix-admin.sql (is_admin 함수) 을 먼저 실행해야 합니다.
-- =========================================================

-- ---------- 프로필 ----------
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

-- ---------- 구단 ----------
alter table public.clubs add column if not exists logo_url   text;
alter table public.clubs add column if not exists owner_id   uuid;
alter table public.clubs add column if not exists funds      bigint not null default 0;
alter table public.clubs add column if not exists created_at timestamptz not null default now();

-- ---------- 이적 신청 ----------
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
-- 권한
-- 열 단위 GRANT 로 본인이 고칠 수 있는 항목을 제한합니다.
-- xp 와 club 은 브라우저에서 절대 바꿀 수 없고,
-- 경험치는 마인크래프트 서버(service_role)가, 소속은 아래 함수만 바꿉니다.
-- =========================================================
alter table public.profiles  enable row level security;
alter table public.transfers enable row level security;

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

drop policy if exists "transfers_read"   on public.transfers;
drop policy if exists "transfers_insert" on public.transfers;
drop policy if exists "transfers_admin"  on public.transfers;
create policy "transfers_read"   on public.transfers for select using (true);
create policy "transfers_insert" on public.transfers for insert to authenticated
  with check (player_id = auth.uid() and status = 'pending');
create policy "transfers_admin"  on public.transfers for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- =========================================================
-- 구단 생성
-- 로고와 프로필이 갖춰져야만 만들 수 있습니다.
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

-- =========================================================
-- 이적 신청 / 결정 / 탈퇴
-- =========================================================
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

-- 구단주가 로고를 바꿀 수 있게
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

notify pgrst, 'reload schema';
