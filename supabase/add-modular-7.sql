-- =========================================================
-- RIFT — 모듈형 코어 7.0.0 연동
-- RIFT-Web-Service 1.3.0 이 쓰는 열입니다.
-- Supabase → SQL Editor 에 붙여넣고 한 번 실행하세요.
-- 여러 번 실행해도 안전합니다.
-- =========================================================

-- ---------------------------------------------------------
-- 1) 선수 — 새 코어가 제공하는 값들
-- ---------------------------------------------------------
alter table public.players add column if not exists cash          bigint default 0;
alter table public.players add column if not exists role          text;
alter table public.players add column if not exists title         text;
alter table public.players add column if not exists season_kills  bigint default 0;
alter table public.players add column if not exists season_deaths bigint default 0;
alter table public.players add column if not exists season_damage bigint default 0;


-- ---------------------------------------------------------
-- 2) 구단 — 리그 승점, 우승 횟수, 색상
-- ---------------------------------------------------------
alter table public.clubs add column if not exists points int default 0;
alter table public.clubs add column if not exists color  text;

-- titles(우승 횟수)와 set_diff 는 이미 있을 수 있습니다. 없으면 만듭니다.
alter table public.clubs add column if not exists titles   int  default 0;
alter table public.clubs add column if not exists set_diff text;

-- add-ranks.sql 을 먼저 안 돌렸을 수도 있어 여기서도 만들어 둡니다.
-- 'rank' 은 PostgREST 가 집계함수로 해석하므로 standing 을 씁니다.
alter table public.clubs add column if not exists standing int;

create index if not exists clubs_points_idx   on public.clubs (points desc);
create index if not exists clubs_standing_idx on public.clubs (standing) where standing is not null;


-- ---------------------------------------------------------
-- 3) 이적을 게임에 반영한 시각
--    플러그인이 승인된 이적을 게임에 적용한 뒤 이 값을 채웁니다.
--    비어 있는 건만 처리하므로 같은 이적을 두 번 적용하지 않습니다.
-- ---------------------------------------------------------
alter table public.transfers add column if not exists applied_at timestamptz;

-- 플러그인이 매번 훑는 조건이라 부분 인덱스를 둡니다.
create index if not exists transfers_pending_apply_idx
  on public.transfers (created_at)
  where status = 'accepted' and applied_at is null;

-- 사이트에서도 "게임 반영됨" 을 보여 줄 수 있게 읽기를 열어 둡니다.
grant select on public.transfers to anon, authenticated;


-- ---------------------------------------------------------
-- 4) 이적 승인 시 소속을 바로 바꾸지 않습니다
--    예전에는 decide_transfer() 가 profiles.club 을 즉시 바꿨습니다.
--    이제는 게임이 진짜 소속을 들고 있으므로, 승인만 기록하고
--    실제 반영은 플러그인이 게임에 적용한 뒤 동기화로 돌아오게 합니다.
--    (게임에 반영되기 전까지 사이트에만 소속이 바뀌어 보이는 일을 막습니다.)
-- ---------------------------------------------------------
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

  if not p_accept then
    return json_build_object('ok', true, 'status', 'rejected');
  end if;

  -- 같은 선수의 다른 대기 신청은 함께 정리합니다.
  update public.transfers
     set status = 'rejected', decided_at = now(), decided_by = '자동'
   where player_id = v_t.player_id and status = 'pending' and id <> p_id;

  -- 소속은 여기서 바꾸지 않습니다.
  -- 플러그인이 게임에 반영한 뒤 동기화로 돌아옵니다.
  -- 로스터 수도 게임 값을 그대로 받으므로 손대지 않습니다.
  return json_build_object(
    'ok', true,
    'status', 'accepted',
    'pending_game', true,
    'message', '승인했습니다. 게임 서버에 반영되면 소속이 바뀝니다.');
end $$;

revoke all on function public.decide_transfer(uuid, boolean) from public, anon;
grant execute on function public.decide_transfer(uuid, boolean) to authenticated;

notify pgrst, 'reload schema';
