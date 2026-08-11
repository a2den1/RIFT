-- =========================================================
-- RIFT — 랭킹 순위 수집
-- RIFT-Web-Service 플러그인이 채우는 열입니다.
-- Supabase → SQL Editor 에 붙여넣고 한 번 실행하세요.
-- 여러 번 실행해도 안전합니다.
-- =========================================================

-- ---------------------------------------------------------
-- 1) 선수 — 피해량과 항목별 전체 순위
--    사이트도 목록을 정렬하지만 그건 화면에 실린 사람들 안에서의 순서입니다.
--    "전체 몇 위" 는 서버 전체를 아는 플러그인이 매겨서 넣습니다.
-- ---------------------------------------------------------
alter table public.players add column if not exists damage         bigint default 0;
alter table public.players add column if not exists rank_kills     int;
alter table public.players add column if not exists rank_playtime  int;
alter table public.players add column if not exists rank_money     int;
alter table public.players add column if not exists rank_bounty    int;
alter table public.players add column if not exists rank_damage    int;

-- 순위로 자주 훑는 열이라 인덱스를 둡니다.
create index if not exists players_rank_kills_idx    on public.players (rank_kills)    where rank_kills    is not null;
create index if not exists players_rank_playtime_idx on public.players (rank_playtime) where rank_playtime is not null;
create index if not exists players_rank_money_idx    on public.players (rank_money)    where rank_money    is not null;
create index if not exists players_rank_bounty_idx   on public.players (rank_bounty)   where rank_bounty   is not null;
create index if not exists players_rank_damage_idx   on public.players (rank_damage)   where rank_damage   is not null;


-- ---------------------------------------------------------
-- 2) 구단 — 순위와 구단 레벨
--    순위 기준은 승 → 세트 득실 → 인지도 순입니다.
-- ---------------------------------------------------------
-- 'rank' 은 PostgREST 가 집계함수 rank() 로 해석해 버려서 이름을 피했습니다.
alter table public.clubs add column if not exists standing int;
alter table public.clubs add column if not exists level int default 1;

create index if not exists clubs_standing_idx on public.clubs (standing) where standing is not null;


-- ---------------------------------------------------------
-- 3) 읽기 권한
--    새 열도 기존과 같이 누구나 볼 수 있어야 합니다.
--    쓰기는 service_role(플러그인) 만 합니다.
-- ---------------------------------------------------------
grant select on public.players to anon, authenticated;
grant select on public.clubs   to anon, authenticated;
