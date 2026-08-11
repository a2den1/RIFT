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
    // 첫 묶음에서 이미 받아 왔으면 그대로 씁니다.
    if (store.profile) return store.profile;
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
      options: { redirectTo: location.origin + '/' },
    });
  };
  store.signOut = async () => {
    if (sb) await sb.auth.signOut();
    store.user = null;
    store.isAdmin = false;
    location.reload();
  };

  /* ---------- 조회 ----------
     Supabase 에 연결돼 있으면 서버 값을 그대로 씁니다.
     비어 있어도 샘플로 채우지 않습니다 — 실제로 없는 내용을 있는 것처럼 보이면 안 되니까.

     필요한 값을 한 번에 요청합니다.
     예전에는 순서대로 기다리느라 왕복이 5~6번 쌓여 1.4초 넘게 걸렸습니다.
     한 묶음으로 보내면 가장 느린 하나만큼(약 0.2초)만 걸립니다. */
  store.ready = (async () => {
    if (!sb) {
      Object.assign(store, {
        notices: SAMPLE.notices, events: SAMPLE.events, clubs: SAMPLE.clubs,
        matches: SAMPLE.matches, players: SAMPLE.players,
      });
      store.clubs = [...store.clubs].sort((a, b) => b.wins - a.wins || b.reputation - a.reputation);
      return;
    }

    // 세션은 localStorage 에서 읽어 오므로 네트워크를 타지 않습니다.
    const { data: sess } = await sb.auth.getSession();
    store.user = sess.session?.user || null;
    store.discordName = discordName(store.user);

    const rows = (r, sample) => {
      if (r.error) {
        console.warn('[RIFT] 불러오기 실패:', r.error.message);
        return sample || [];
      }
      return r.data || [];
    };

    const [notices, events, clubs, matches, players, status, imgs, locks, profs, who, mine] =
      await Promise.all([
        sb.from('notices').select('*').order('created_at', { ascending: false }),
        sb.from('events').select('*').order('starts_at'),
        sb.from('clubs').select('*'),
        sb.from('matches').select('*').order('starts_at'),
        sb.from('players').select('*').order('kills', { ascending: false }),
        sb.from('server_status').select('online_count').limit(1),
        sb.from('site_images').select('key,url'),
        sb.from('tab_locks').select('page,locked,reason'),
        sb.from('profiles').select('mc_name,pronouns'),
        store.user ? sb.rpc('whoami') : Promise.resolve({ data: null, error: null }),
        // 내 프로필 행도 같이 받아 둡니다. 내 정보 · 구단 화면이 곧바로 그려집니다.
        store.user
          ? sb.from('profiles').select('*').eq('id', store.user.id).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);

    if (mine && !mine.error && mine.data) store.profile = mine.data;

    store.notices = rows(notices);
    store.events = rows(events);
    store.matches = rows(matches);
    store.players = rows(players);
    store.clubs = rows(clubs).sort((a, b) => b.wins - a.wins || b.reputation - a.reputation);

    // 접속자 수는 마인크래프트 서버가 갱신할 때만 표시합니다.
    store.onlineCount = null;
    if (!status.error && status.data && status.data.length) {
      store.onlineCount = status.data[0].online_count;
    }

    rows(imgs).forEach((r) => r.url && (store.images[r.key] = r.url));
    store.locks = rows(locks);

    // 프로필의 대명사를 랭킹 호버 카드에도 보여줍니다.
    rows(profs).forEach((pr) => {
      const p = store.players.find((x) => x.name === pr.mc_name);
      if (p && pr.pronouns) p.pronouns = pr.pronouns;
    });

    // RLS 와 같은 기준으로 판단하도록 DB 의 is_admin() 결과를 그대로 씁니다.
    if (store.user) {
      if (!who.error && who.data) {
        store.whoami = who.data;
        store.isAdmin = !!who.data.is_admin;
      } else {
        // whoami() 가 없는 예전 스키마 대비
        const { data: adm } = await sb.from('admins').select('discord_username');
        store.admins = adm || [];
        store.isAdmin =
          (adm || []).some((r) => norm(r.discord_username) === norm(store.discordName)) ||
          norm(store.discordName) === norm(CFG.bootstrapAdmin);
      }
    }
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
