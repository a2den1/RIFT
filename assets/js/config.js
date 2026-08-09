/* =========================================================
   RIFT — 설정
   여기만 수정하면 사이트 전체에 반영됩니다.
   ========================================================= */
window.RIFT_CONFIG = {
  serverIp: 'play.rift.kr',
  version: 'Java 1.21.x',
  discordInvite: '#',

  /* ---------- Supabase ----------
     Supabase 프로젝트 → Settings → API 에서 값을 복사해 넣으세요.
     비워두면 아래 SAMPLE 데이터로 동작하고, 로그인 기능은 비활성화됩니다.
     supabase/schema.sql 을 SQL Editor에서 먼저 실행해야 합니다. */
  supabase: {
    url: 'https://monwqvbwsonbnrhwqfnb.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1vbndxdmJ3c29uYm5yaHdxZm5iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYyNjE5ODYsImV4cCI6MjEwMTgzNzk4Nn0.aJ_wqnkPXk3Q2eUkCvK3DdcQ8XdczryBR2bEAW3Mm8s',
  },

  /* ---------- 로그인 ---------- */
  aidenAccountUrl: 'https://aidenac.kro.kr',
  // 최초 관리자. 실제 권한은 Supabase admins 테이블과 RLS가 결정합니다.
  bootstrapAdmin: '_a2den.',

  /* ---------- 이미지 ----------
     assets/img/shots 안의 파일을 실제 스크린샷으로 바꾸고 경로만 고치면 됩니다. */
  images: {
    wild: 'assets/img/shots/wild.svg',
    league: 'assets/img/shots/league.svg',
    club: 'assets/img/shots/club.svg',
    news: 'assets/img/shots/news.svg',
    match: 'assets/img/shots/match.svg',
    jobs: {
      공격수: 'assets/img/shots/job-attack.svg',
      탱커: 'assets/img/shots/job-tank.svg',
      원거리: 'assets/img/shots/job-range.svg',
      서포터: 'assets/img/shots/job-support.svg',
    },
  },
};
