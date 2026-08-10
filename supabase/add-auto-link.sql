-- =========================================================
-- 게임 내 디스코드 연동 기록으로 자동 인증
-- add-mc-verify.sql 다음에 실행하세요. 여러 번 실행해도 안전합니다.
--
-- RIFT-Core 에 이미 /디스코드연동 기능이 있어서, 게임에서 연동을 마친
-- 플레이어는 디스코드 ID ↔ 마인크래프트 닉네임 짝이 서버에 남아 있습니다.
-- 사이트도 디스코드로 로그인하므로 같은 ID 를 대조하면
-- 코드 입력 없이 바로 인증할 수 있습니다.
-- =========================================================

-- 플러그인이 채우는 연동 표
create table if not exists public.mc_links (
  discord_id  text primary key,
  mc_name     text not null,
  mc_uuid     text,
  updated_at  timestamptz not null default now()
);

alter table public.profiles add column if not exists discord_id text;

-- 이 표는 개인 계정 매핑이라 아무에게도 열지 않습니다.
-- 정책을 만들지 않으면 anon 과 authenticated 는 접근할 수 없고,
-- service_role(플러그인)과 security definer 함수만 읽고 씁니다.
alter table public.mc_links enable row level security;
drop policy if exists "mc_links_read"  on public.mc_links;
drop policy if exists "mc_links_write" on public.mc_links;


-- =========================================================
-- 사이트: 게임 연동 기록이 있으면 그대로 인증 처리
-- =========================================================
create or replace function public.try_auto_link()
returns json language plpgsql security definer set search_path = public as $$
declare
  v_uid  uuid := auth.uid();
  v_did  text := public.current_discord_id();
  v_link public.mc_links%rowtype;
  v_prof public.profiles%rowtype;
begin
  if v_uid is null then
    return json_build_object('ok', false, 'error', '로그인이 필요합니다.');
  end if;

  select * into v_prof from public.profiles where id = v_uid;
  if found and v_prof.mc_name is not null then
    return json_build_object('ok', true, 'already', true, 'name', v_prof.mc_name);
  end if;

  if v_did is null or v_did = '' then
    return json_build_object('ok', false, 'error', '디스코드 ID 를 확인할 수 없습니다.');
  end if;

  select * into v_link from public.mc_links where discord_id = v_did;
  if not found then
    return json_build_object('ok', false, 'error', '게임 내 디스코드 연동 기록이 없습니다.');
  end if;

  if exists (select 1 from public.profiles
              where lower(mc_name) = lower(v_link.mc_name) and id <> v_uid) then
    return json_build_object('ok', false, 'error', '이미 다른 계정에 연결된 닉네임입니다.');
  end if;

  update public.profiles
     set mc_name        = v_link.mc_name,
         mc_uuid        = v_link.mc_uuid,
         discord_id     = v_did,
         mc_verified_at = now(),
         updated_at     = now()
   where id = v_uid;

  return json_build_object('ok', true, 'name', v_link.mc_name, 'auto', true);
end $$;

revoke all on function public.try_auto_link() from public, anon;
grant execute on function public.try_auto_link() to authenticated;

notify pgrst, 'reload schema';
