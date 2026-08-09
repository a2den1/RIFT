-- =========================================================
-- 관리자 권한 문제 해결용 패치
-- Supabase → SQL Editor 에 통째로 붙여넣고 Run 하세요.
-- 여러 번 실행해도 안전합니다.
-- =========================================================

-- 1) 디스코드 고유 ID 컬럼 추가 (사용자명이 바뀌어도 권한 유지)
alter table public.admins add column if not exists discord_id text;

-- 2) 이름 정규화 — 소문자 + 뒤쪽 `#0` 제거
create or replace function public.norm_discord(s text)
returns text language sql immutable as $$
  select regexp_replace(lower(coalesce(s, '')), '#0$', '');
$$;

-- 3) JWT 에서 사용자명과 디스코드 ID 꺼내기
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

-- 4) 관리자 판정 — 이름(정규화) 또는 디스코드 ID 로 대조
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

-- 5) 진단 함수 — 관리자 페이지에서 호출합니다
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

-- 6) 최초 관리자 행이 있는지 확인
insert into public.admins (discord_username)
values ('_a2den.')
on conflict (discord_username) do nothing;

-- 7) 실행 결과 확인 — admins 에 무엇이 들어 있는지
select id, discord_username, public.norm_discord(discord_username) as 정규화, discord_id
from public.admins;
