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
    images: Object.assign({}, CFG.images),
    locks: [],
    user: null,
    isAdmin: false,
    ready: null,
  };

  store.image = (key) => store.images[key] || CFG.images[key] || '';
  store.lockOf = (page) => store.locks.find((l) => l.page === page && l.locked) || null;

  /* ---------- 경험치 ----------
     레벨 n 에 도달하려면 100 * (n-1)^2 의 경험치가 필요합니다. */
  store.levelOf = (xp) => Math.floor(Math.sqrt(Math.max(xp, 0) / 100)) + 1;
  store.levelBand = (xp) => {
    const lv = store.levelOf(xp);
    const from = 100 * (lv - 1) ** 2;
    const to = 100 * lv ** 2;
    return { level: lv, from, to, pct: Math.min(100, Math.round(((xp - from) / (to - from)) * 100)) };
  };

  // 로그인한 사용자의 프로필 행을 확보합니다. 없으면 만들어 둡니다.
  store.ensureProfile = async () => {
    if (!sb || !store.user) return null;
    const { data } = await sb.from('profiles').select('*').eq('id', store.user.id).maybeSingle();
    if (data) {
      store.profile = data;
      return data;
    }
    const { data: made, error } = await sb
      .from('profiles')
      .insert({ id: store.user.id, discord_username: discordName(store.user) })
      .select()
      .maybeSingle();
    if (error) {
      console.warn('[RIFT] 프로필 생성 실패:', error.message);
      return null;
    }
    store.profile = made;
    return made;
  };

  /* ---------- 로그인 ---------- */
  // 디스코드 신규 계정은 구분자가 0 이라 `_a2den.#0` 형태로 옵니다.
  // 비교는 SQL 의 norm_discord() 와 동일하게 소문자 + `#0` 제거로 맞춥니다.
  const stripTag = (s) => (s || '').replace(/#0$/, '');
  const norm = (s) => stripTag(String(s || '').toLowerCase());

  function discordName(user) {
    if (!user) return null;
    const m = user.user_metadata || {};
    const raw =
      m.preferred_username || m.user_name || m.name || m.full_name ||
      (m.custom_claims && m.custom_claims.global_name) || null;
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
        // RLS 와 같은 기준으로 판단하도록 DB 의 is_admin() 결과를 그대로 씁니다.
        // 화면에서는 관리자인데 저장은 막히는(또는 그 반대) 상황을 없애기 위함입니다.
        const { data: who, error } = await sb.rpc('whoami');
        if (!error && who) {
          store.whoami = who;
          store.isAdmin = !!who.is_admin;
        } else {
          // whoami() 가 없는 예전 스키마 대비 — 클라이언트에서 같은 규칙으로 대조
          const { data: rows } = await sb.from('admins').select('discord_username');
          store.admins = rows || [];
          store.isAdmin =
            (rows || []).some((r) => norm(r.discord_username) === norm(name)) ||
            norm(name) === norm(CFG.bootstrapAdmin);
        }
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

        // 프로필의 대명사를 랭킹 호버 카드에도 보여줍니다.
      const { data: profs } = await sb.from('profiles').select('mc_name,pronouns,club,job');
      (profs || []).forEach((pr) => {
        const p = store.players.find((x) => x.name === pr.mc_name);
        if (p && pr.pronouns) p.pronouns = pr.pronouns;
      });

    // 관리자가 바꾼 이미지와 탭 잠금 상태
      const [{ data: imgs }, { data: locks }] = await Promise.all([
        sb.from('site_images').select('key,url'),
        sb.from('tab_locks').select('page,locked,reason'),
      ]);
      (imgs || []).forEach((r) => r.url && (store.images[r.key] = r.url));
      store.locks = locks || [];
    }

    // 순위표는 승수 → 세트득실 순으로 정렬
    store.clubs = [...store.clubs].sort((a, b) => b.wins - a.wins || b.reputation - a.reputation);
    store.discordName = discordName(store.user);
  })();

  /* ---------- 랭킹 정의 ----------
     cols 의 각 항목은 정렬 가능한 열입니다.
     k: 정렬 키, get: 값 계산(없으면 p[k]), num: 숫자 열, chip: 칩 모양으로 표시 */
  const KD = { k: 'kd', label: 'K/D', num: true, get: (p) => +(p.kills / Math.max(p.deaths, 1)).toFixed(2) };
  const JOB = { k: 'job', label: '직업', chip: true };

  store.boards = () => ({
    kill: {
      label: 'PVP 킬', unit: '킬', key: 'kills',
      cols: [JOB, { k: 'kills', label: '킬', num: true }, { k: 'deaths', label: '데스', num: true }, KD],
    },
    time: {
      label: '플레이타임', unit: '시간', key: 'playtime',
      cols: [JOB, { k: 'playtime', label: '플레이타임 (시간)', num: true }],
    },
    money: {
      label: '게임머니', unit: '원', key: 'money',
      cols: [JOB, { k: 'money', label: '보유 게임머니', num: true }],
    },
    bounty: {
      label: '현상금', unit: '원', key: 'bounty',
      cols: [JOB, { k: 'bounty', label: '누적 현상금', num: true }],
    },
  });

  store.clubCols = () => [
    { k: 'games', label: '경기', num: true },
    { k: 'wins', label: '승', num: true },
    { k: 'losses', label: '패', num: true },
    { k: 'set_diff', label: '세트 득실', get: (c) => parseInt(c.set_diff, 10) || 0, num: true, raw: (c) => c.set_diff ?? '—' },
    { k: 'reputation', label: '인지도', num: true, bar: true },
    { k: 'titles', label: '우승', num: true },
  ];

  store.sorted = (key) => [...store.players].filter((p) => p[key] > 0).sort((a, b) => b[key] - a[key]);
  store.player = (name) => store.players.find((p) => p.name === name);
  store.club = (name) => store.clubs.find((c) => c.name === name);

  window.RIFT = store;
})();
