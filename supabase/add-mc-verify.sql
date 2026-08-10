-- =========================================================
-- 마인크래프트 닉네임 인게임 인증
-- SQL Editor 에 붙여넣고 Run 하세요. 여러 번 실행해도 안전합니다.
-- ALL.sql 을 먼저 실행한 뒤에 적용하세요.
--
-- 지금까지는 사이트에서 닉네임을 그냥 입력할 수 있어서
-- 남의 닉네임을 적어도 막을 방법이 없었습니다.
-- 이제 사이트에서 코드를 받고 게임 안에서 /웹인증 <코드> 를 쳐야만
-- 닉네임이 등록됩니다. 게임에 접속할 수 있는 사람만 가능합니다.
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

notify pgrst, 'reload schema';
