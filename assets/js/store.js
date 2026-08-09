/* =========================================================
   RIFT — 데이터 계층 + 로그인
   Supabase가 설정되어 있으면 서버에서, 아니면 샘플 데이터로 동작합니다.
   ========================================================= */
(function () {
  const CFG = window.RIFT_CONFIG;
  const SAMPLE = window.RIFT_SAMPLE;

  const hasSupabase = !!(CFG.supabase.url && CFG.supabase.anonKey && window.supabase);
  const sb = hasSupabase ? window.supabase.createClient(CFG.supabase.url, CFG.supabase.anonKey) : null;

  const store = {
    connected: hasSupabase,
    client: sb,
    onlineCount: SAMPLE.onlineCount,
    notices: [],
    events: [],
    clubs: [],
    matches: [],
    players: [],
    admins: [],
    user: null,
    isAdmin: false,
    ready: null,
  };

  /* ---------- 로그인 ---------- */
  // 디스코드 신규 계정은 구분자가 0 이라 `_a2den.#0` 형태로 옵니다. 표시와 비교 모두 `#0` 을 떼고 씁니다.
  const stripTag = (s) => (s || '').replace(/#0$/, '');

  function discordName(user) {
    if (!user) return null;
    const m = user.user_metadata || {};
    const raw = m.preferred_username || m.user_name || m.name || m.full_name || null;
    return raw ? stripTag(raw) : null;
  }

  store.signInDiscord = async () => {
    if (!sb) throw new Error('Supabase가 설정되지 않았습니다.');
    return sb.auth.signInWithOAuth({
      provider: 'discord',
      options: { redirectTo: location.origin + location.pathname.replace(/login\.html$/, 'index.html') },
    });
  };
  store.signOut = async () => {
    if (sb) await sb.auth.signOut();
    store.user = null;
    store.isAdmin = false;
    location.reload();
  };

  /* ---------- 조회 ---------- */
  // Supabase에 연결돼 있으면 서버 값을 그대로 씁니다.
  // 비어 있어도 샘플로 채우지 않습니다 — 실제로 없는 내용을 있는 것처럼 보이면 안 되니까.
  async function pull(table, order, sample) {
    if (!sb) return sample;
    const q = sb.from(table).select('*');
    if (order) q.order(order.col, { ascending: order.asc !== false });
    const { data, error } = await q;
    if (error) {
      console.warn(`[RIFT] ${table} 불러오기 실패:`, error.message, '— 샘플 데이터를 사용합니다.');
      return sample;
    }
    return data || [];
  }

  store.ready = (async () => {
    if (sb) {
      const { data } = await sb.auth.getSession();
      store.user = data.session?.user || null;
      if (store.user) {
        const name = discordName(store.user);
        const { data: rows } = await sb.from('admins').select('discord_username');
        store.admins = rows || [];
        store.isAdmin =
          (rows || []).some((r) => stripTag(r.discord_username) === name) ||
          name === stripTag(CFG.bootstrapAdmin);
      }
    }

    const [notices, events, clubs, matches, players] = await Promise.all([
      pull('notices', { col: 'created_at', asc: false }, SAMPLE.notices),
      pull('events', { col: 'starts_at', asc: true }, SAMPLE.events),
      pull('clubs', { col: 'reputation', asc: false }, SAMPLE.clubs),
      pull('matches', { col: 'starts_at', asc: true }, SAMPLE.matches),
      pull('players', { col: 'kills', asc: false }, SAMPLE.players),
    ]);
    Object.assign(store, { notices, events, clubs, matches, players });

    // 접속자 수는 마인크래프트 서버가 server_status 테이블을 갱신할 때만 표시합니다.
    // 테이블이 없거나 비어 있으면 null 로 두고 화면에서 숨깁니다.
    if (sb) {
      store.onlineCount = null;
      const { data } = await sb.from('server_status').select('online_count').limit(1);
      if (data && data.length) store.onlineCount = data[0].online_count;
    }

    // 순위표는 승수 → 세트득실 순으로 정렬
    store.clubs = [...store.clubs].sort((a, b) => b.wins - a.wins || b.reputation - a.reputation);
    store.discordName = discordName(store.user);
  })();

  /* ---------- 랭킹 정의 ---------- */
  store.boards = () => ({
    kill: {
      label: 'PVP 킬', unit: '킬', key: 'kills',
      cols: ['순위', '플레이어', '직업', '킬', '데스', 'K/D'],
      row: (p) => [p.kills, p.deaths, (p.kills / Math.max(p.deaths, 1)).toFixed(2)],
    },
    time: {
      label: '플레이타임', unit: '시간', key: 'playtime',
      cols: ['순위', '플레이어', '직업', '플레이타임 (시간)'],
      row: (p) => [p.playtime],
    },
    money: {
      label: '게임머니', unit: '원', key: 'money',
      cols: ['순위', '플레이어', '직업', '보유 게임머니'],
      row: (p) => [p.money],
    },
    bounty: {
      label: '현상금', unit: '원', key: 'bounty',
      cols: ['순위', '플레이어', '직업', '누적 현상금'],
      row: (p) => [p.bounty],
    },
  });

  store.sorted = (key) => [...store.players].filter((p) => p[key] > 0).sort((a, b) => b[key] - a[key]);
  store.player = (name) => store.players.find((p) => p.name === name);
  store.club = (name) => store.clubs.find((c) => c.name === name);

  window.RIFT = store;
})();
