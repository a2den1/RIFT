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
     기본값입니다. 관리자 페이지에서 바꾸면 Supabase 값이 우선합니다.
     assets/img/shots 안의 파일을 실제 스크린샷으로 교체해도 됩니다. */
  images: {
    wild: 'assets/img/shots/wild.svg',
    league: 'assets/img/shots/league.svg',
    news: 'assets/img/shots/news.svg',
    match: 'assets/img/shots/match.svg',
    job_attack: 'assets/img/shots/job-attack.svg',
    job_tank: 'assets/img/shots/job-tank.svg',
    job_range: 'assets/img/shots/job-range.svg',
    job_support: 'assets/img/shots/job-support.svg',
  },

  // 관리자 페이지에 표시할 이미지 목록
  imageSlots: [
    { key: 'wild', label: '홈 · 야생 블록', size: '1600×900' },
    { key: 'league', label: '홈 · 리그 블록', size: '1600×900' },
    { key: 'news', label: '공지 기본 이미지', size: '1200×675' },
    { key: 'match', label: '경기 기본 이미지', size: '1200×900' },
    { key: 'job_attack', label: '직업 · 공격수', size: '800×600' },
    { key: 'job_tank', label: '직업 · 탱커', size: '800×600' },
    { key: 'job_range', label: '직업 · 원거리', size: '800×600' },
    { key: 'job_support', label: '직업 · 서포터', size: '800×600' },
  ],

  // 잠글 수 있는 탭
  tabs: [
    { page: 'play', label: '서버 접속' },
    { page: 'guide', label: '도움말' },
    { page: 'league', label: '공식 리그' },
    { page: 'ranking', label: '랭킹' },
    { page: 'support', label: '후원' },
  ],
};
