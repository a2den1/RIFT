/* =========================================================
   RIFT — 샘플 데이터
   Supabase가 설정되지 않았을 때 화면을 채우는 값입니다.
   실제 운영 데이터는 Supabase에서 불러옵니다.
   ========================================================= */
window.RIFT_SAMPLE = {
  onlineCount: 128,

  notices: [
    { title: '베타 3주차 패치', body: '구리 던전 보상 조정, 현상금 누적 상한 상향, PVP 태그 지속시간 변경.', created_at: '2026-08-08' },
    { title: '일일 상점 상품 개편', body: '직업별 소모품이 추가되고 갱신 시각이 매일 오전 6시로 고정됩니다.', created_at: '2026-08-03' },
  ],

  events: [
    { title: '구리 던전 주간 경쟁', body: '이번 주 던전 최단 클리어 상위 3명에게 추가 보상을 지급합니다.', starts_at: '2026-08-09', ends_at: '2026-08-16' },
    { title: '현상금 2배 주말', body: '주말 동안 현상금 획득량이 2배로 적용됩니다.', starts_at: '2026-08-15', ends_at: '2026-08-17' },
  ],

  clubs: [
    { name: 'NOVA', games: 12, wins: 10, losses: 2, set_diff: '+13', reputation: 8420, titles: 2, owner: 'Vellum', roster: 14 },
    { name: 'BLACKOUT', games: 12, wins: 9, losses: 3, set_diff: '+10', reputation: 7910, titles: 1, owner: 'Drex', roster: 13 },
    { name: 'SPECTRA', games: 12, wins: 7, losses: 5, set_diff: '+3', reputation: 6240, titles: 1, owner: 'Kuro', roster: 12 },
    { name: 'IRONVEIL', games: 12, wins: 6, losses: 6, set_diff: '+1', reputation: 5580, titles: 0, owner: 'Nine', roster: 12 },
    { name: 'KRONOS', games: 12, wins: 5, losses: 7, set_diff: '-4', reputation: 4730, titles: 0, owner: 'Halcyon', roster: 12 },
    { name: 'ASHFALL', games: 12, wins: 3, losses: 9, set_diff: '-11', reputation: 3160, titles: 0, owner: 'Miro', roster: 12 },
  ],

  matches: [
    { starts_at: '2026-08-10T21:00', home: 'NOVA', away: 'KRONOS', map: '협곡' },
    { starts_at: '2026-08-11T21:00', home: 'SPECTRA', away: 'BLACKOUT', map: '폐광' },
    { starts_at: '2026-08-12T21:00', home: 'IRONVEIL', away: 'ASHFALL', map: '설원' },
  ],

  players: [
    { name: 'Aiden',   job: '공격수', club: 'NOVA',     kills: 412, deaths: 96,  playtime: 389, money: 15970000, bounty: 4200000 },
    { name: 'Ravenz',  job: '원거리', club: 'BLACKOUT', kills: 388, deaths: 110, playtime: 241, money: 18420000, bounty: 2480000 },
    { name: 'Kuro',    job: '공격수', club: 'SPECTRA',  kills: 351, deaths: 124, playtime: 310, money: 9120000,  bounty: 3150000 },
    { name: 'Vellum',  job: '탱커',   club: 'NOVA',     kills: 297, deaths: 141, playtime: 412, money: 8650000,  bounty: 0 },
    { name: 'Nine',    job: '원거리', club: 'IRONVEIL', kills: 284, deaths: 103, playtime: 338, money: 7430000,  bounty: 1140000 },
    { name: 'Halcyon', job: '서포터', club: 'KRONOS',   kills: 221, deaths: 88,  playtime: 361, money: 10880000, bounty: 0 },
    { name: 'Drex',    job: '탱커',   club: 'BLACKOUT', kills: 198, deaths: 132, playtime: 287, money: 12340000, bounty: 1720000 },
    { name: 'Miro',    job: '공격수', club: 'ASHFALL',  kills: 176, deaths: 95,  playtime: 264, money: 6010000,  bounty: 860000 },
  ],
};
