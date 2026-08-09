/* =========================================================
   RIFT — 화면 스크립트
   ========================================================= */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const CFG = window.RIFT_CONFIG;

const nf = (v) => (typeof v === 'number' ? v.toLocaleString() : v ?? '—');
const won = (v) => (v ? v.toLocaleString() + '원' : '없음');
const kd = (p) => (p.kills / Math.max(p.deaths, 1)).toFixed(2);

function skinHead(name, size = 28, cls = '') {
  const fb =
    'data:image/svg+xml;utf8,' +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#7c47ff"/><text x="32" y="43" font-size="30" font-family="sans-serif" fill="#fff" text-anchor="middle">${name[0].toUpperCase()}</text></svg>`
    );
  return `<img class="${cls}" src="https://mc-heads.net/avatar/${encodeURIComponent(name)}/${size * 2}"
    alt="${name}" loading="lazy" onerror="this.onerror=null;this.src='${fb}'">`;
}
const medal = (i) => `<span class="medal${i < 3 ? ' m' + (i + 1) : ''}">${i + 1}</span>`;

function when(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return { time: '미정', date: String(iso ?? '') };
  const dow = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];
  const p = (n) => String(n).padStart(2, '0');
  return { time: `${p(d.getHours())}:${p(d.getMinutes())}`, date: `${p(d.getMonth() + 1)}.${p(d.getDate())} (${dow})` };
}
const dateOnly = (iso) => {
  const d = new Date(iso);
  return isNaN(d) ? String(iso ?? '') : `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
};

function countUp(el, target) {
  if (document.hidden || matchMedia('(prefers-reduced-motion: reduce)').matches) {
    el.textContent = target.toLocaleString();
    return;
  }
  const start = performance.now();
  const tick = (t) => {
    const p = Math.min((t - start) / 1000, 1);
    el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3))).toLocaleString();
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/* =========================================================
   시작
   ========================================================= */
document.addEventListener('DOMContentLoaded', async () => {
  initHeader();
  initToast();
  await RIFT.ready;
  initAuthUI();

  $$('[data-copy-ip]').forEach((el) => (el.textContent = CFG.serverIp));
  $$('[data-version]').forEach((el) => (el.textContent = CFG.version));
  $$('[data-discord]').forEach((el) => el.setAttribute('href', CFG.discordInvite));
  const on = $('#onlineCount');
  if (on) {
    if (RIFT.onlineCount == null) {
      // 실제 접속자 수를 받아올 곳이 없으면 숫자를 지어내지 않습니다.
      const chip = $('#onlineChip');
      if (chip) chip.remove();
      else on.textContent = '—';
    } else countUp(on, RIFT.onlineCount);
  }

  if (applyTabLock()) return; // 막힌 탭이면 본문을 대체하고 나머지 렌더링은 생략

  $$('[data-img]').forEach((el) => (el.src = RIFT.image(el.dataset.img)));
  renderJobs();
  renderNews();
  renderEvents();
  renderClubTable();
  renderMatches();
  renderHomeBoards();
  renderRanking();
  initGuide();
  initHoverCard();
  initPills();

  $$('[data-plan]').forEach((b) =>
    b.addEventListener('click', () => toast(`${b.dataset.plan} 후원 문의는 디스코드에서 받습니다.`))
  );

  if (!document.body.classList.contains('no-anim')) initReveal();
});

/* =========================================================
   헤더 / 토스트
   ========================================================= */
function initHeader() {
  const header = $('#header');
  if (header) {
    const onScroll = () => header.classList.toggle('scrolled', scrollY > 30);
    onScroll();
    addEventListener('scroll', onScroll, { passive: true });
  }
  const nav = $('#nav');
  const toggle = $('#navToggle');
  if (nav && toggle) {
    toggle.addEventListener('click', () => {
      const open = nav.classList.toggle('open');
      toggle.innerHTML = `<i class="fa-solid fa-${open ? 'xmark' : 'bars'}"></i>`;
      // 메뉴가 열린 뒤에야 링크 위치가 잡히므로 움직이는 배경을 다시 계산합니다.
      if (open && nav._pill) requestAnimationFrame(nav._pill.toActive);
    });
  }
  const here = location.pathname.split('/').pop() || 'index.html';
  $$('#nav a').forEach((a) => a.getAttribute('href') === here && a.classList.add('current'));

  $$('[data-copy-btn]').forEach((b) =>
    b.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(CFG.serverIp);
      } catch {
        const ta = document.createElement('textarea');
        ta.value = CFG.serverIp;
        document.body.append(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
      }
      toast('서버 주소를 복사했습니다.');
    })
  );
}

let toastTimer;
function initToast() {
  window.toast = (msg) => {
    const t = $('#toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
  };
}

/* =========================================================
   로그인 상태
   ========================================================= */
function initAuthUI() {
  const slot = $('#authSlot');
  const nav = $('#nav');

  if (RIFT.isAdmin && nav && !$('.admin-link', nav)) {
    const a = document.createElement('a');
    a.href = 'admin.html';
    a.className = 'admin-link';
    a.textContent = '관리자';
    nav.append(a);
    if ((location.pathname.split('/').pop() || '') === 'admin.html') a.classList.add('current');
  }

  if (!slot) return;
  if (RIFT.user) {
    const m = RIFT.user.user_metadata || {};
    slot.innerHTML = `
      <div class="me">
        <img src="${m.avatar_url || m.picture || ''}" alt="" onerror="this.style.visibility='hidden'">
        <span>${RIFT.discordName || '사용자'}</span>
        <button id="signOut" title="로그아웃"><i class="fa-solid fa-arrow-right-from-bracket"></i></button>
      </div>`;
    $('#signOut').addEventListener('click', () => RIFT.signOut());
  } else {
    slot.innerHTML = `<a href="login.html" class="btn btn-soft btn-sm">로그인</a>`;
  }
}

/* =========================================================
   탭 잠금
   관리자는 잠긴 탭도 볼 수 있고, 상단에 안내 띠만 표시됩니다.
   ========================================================= */
function applyTabLock() {
  const page = (location.pathname.split('/').pop() || 'index.html').replace(/\.html$/, '');

  // 잠긴 탭은 내비에 자물쇠를 붙입니다.
  RIFT.locks
    .filter((l) => l.locked)
    .forEach((l) => {
      const a = $(`#nav a[href="${l.page}.html"]`);
      if (a && !$('.lock-mark', a)) {
        a.classList.add('locked');
        a.insertAdjacentHTML('beforeend', ' <i class="fa-solid fa-lock lock-mark"></i>');
      }
    });

  const lock = RIFT.lockOf(page);
  if (!lock) return false;

  if (RIFT.isAdmin) {
    const main = $('main');
    main?.insertAdjacentHTML(
      'afterbegin',
      `<div class="wrap" style="padding-top:calc(var(--header-h) + 24px)">
         <div class="banner"><i class="fa-solid fa-lock"></i>
           <div><b>이 탭은 현재 막혀 있습니다</b>
           <p>${lock.reason ? escapeHtml(lock.reason) : '사유가 등록되지 않았습니다.'} — 관리자에게만 보입니다.</p></div>
         </div>
       </div>`
    );
    return false;
  }

  const main = $('main');
  if (main) {
    main.className = 'wrap';
    main.innerHTML = `
      <div class="locked-page">
        <div class="lock-ic"><i class="fa-solid fa-lock"></i></div>
        <h1>탭이 막혀있습니다</h1>
        <p class="lock-reason">${lock.reason ? escapeHtml(lock.reason) : '사유가 등록되지 않았습니다.'}</p>
        <a href="index.html" class="btn btn-primary">홈으로</a>
      </div>`;
  }
  return true;
}

const escapeHtml = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* =========================================================
   소식 · 이벤트
   ========================================================= */
const JOBS = [
  ['공격수', 'job_attack', '전선을 뚫고 상대를 압박합니다.'],
  ['탱커', 'job_tank', '거점을 지키고 피해를 받아냅니다.'],
  ['원거리', 'job_range', '거리를 두고 피해를 누적시킵니다.'],
  ['서포터', 'job_support', '아군을 회복하고 강화합니다.'],
];

function renderJobs() {
  const box = $('#jobs');
  if (!box) return;
  box.innerHTML = JOBS.map(
    ([name, key, desc]) => `
    <div class="job">
      <div class="job-media"><img class="shot" src="${RIFT.image(key)}" alt="${name}"></div>
      <div class="job-body"><h3>${name}</h3><p>${desc}</p></div>
    </div>`
  ).join('');
}

function renderNews() {
  const box = $('#news');
  if (!box) return;
  const items = RIFT.notices.slice(0, 3);
  if (!items.length) return void (box.outerHTML = `<div class="empty">등록된 공지가 없습니다.</div>`);
  box.innerHTML = items
    .map(
      (n) => `
      <article class="news-item">
        <div class="news-media"><img class="shot" src="${n.image_url || RIFT.image('news')}" alt=""></div>
        <div class="news-body">
          <div class="news-tag"><b>공지</b> <span>${dateOnly(n.created_at)}</span></div>
          <h3>${n.title}</h3>
          <p>${n.body || ''}</p>
        </div>
      </article>`
    )
    .join('');
}

function renderEvents() {
  const box = $('#events');
  if (!box) return;
  if (!RIFT.events.length) return void (box.innerHTML = `<div class="empty">진행 중인 이벤트가 없습니다.</div>`);
  box.innerHTML = RIFT.events
    .map(
      (e) => `
      <div class="card">
        <div class="c-ic"><i class="fa-solid fa-calendar-day"></i></div>
        <h3>${e.title}</h3>
        <p>${e.body || ''}</p>
        <p class="muted" style="margin-top:10px;font-size:13.5px">${dateOnly(e.starts_at)}${e.ends_at ? ' — ' + dateOnly(e.ends_at) : ''}</p>
      </div>`
    )
    .join('');
}

/* =========================================================
   구단 순위표
   ========================================================= */
const emptyRow = (cols, msg) => `<tr><td class="empty" colspan="${cols}">${msg}</td></tr>`;

/* =========================================================
   정렬 가능한 표
   헤더를 누르면 그 열 기준으로 다시 정렬합니다.
   숫자 열은 큰 값부터, 글자 열은 가나다순으로 시작합니다.
   ========================================================= */
function sortableTable({ head, body, lead, cols, rows, defaultKey, rowHtml }) {
  let key = defaultKey;
  let dir = 'desc';
  const val = (r, c) => (c.get ? c.get(r) : r[c.k]);

  function paint() {
    const col = cols.find((c) => c.k === key);
    const sorted = col
      ? [...rows].sort((a, b) => {
          const x = val(a, col), y = val(b, col);
          if (typeof x === 'number' && typeof y === 'number') return dir === 'desc' ? y - x : x - y;
          return (dir === 'desc' ? -1 : 1) * String(x ?? '').localeCompare(String(y ?? ''), 'ko');
        })
      : rows;

    head.innerHTML =
      lead.map((l, i) => `<th class="${i === lead.length - 1 ? '' : 'c'}">${l}</th>`).join('') +
      cols
        .map((c) => {
          const on = c.k === key;
          const icon = on ? (dir === 'desc' ? 'arrow-down-wide-short' : 'arrow-up-short-wide') : 'sort';
          return `<th class="c sortable${on ? ' sorted' : ''}" data-sort="${c.k}"
            title="${c.label} 기준 정렬" role="button" tabindex="0">${c.label}<i class="fa-solid fa-${icon}"></i></th>`;
        })
        .join('');

    body.innerHTML = sorted.map((r, i) => rowHtml(r, i, key === defaultKey && dir === 'desc')).join('');
  }

  head.addEventListener('click', (e) => {
    const th = e.target.closest('[data-sort]');
    if (!th) return;
    const c = cols.find((x) => x.k === th.dataset.sort);
    if (key === c.k) dir = dir === 'desc' ? 'asc' : 'desc';
    else {
      key = c.k;
      dir = c.num ? 'desc' : 'asc';
    }
    paint();
  });
  head.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.target.closest('[data-sort]')?.click();
    }
  });

  paint();
  return { repaint: paint, reset: () => { key = defaultKey; dir = 'desc'; paint(); } };
}

function renderClubTable() {
  const body = $('#standings');
  const head = $('#standingsHead');
  if (!body || !head) return;
  if (!RIFT.clubs.length) return void (body.innerHTML = emptyRow(8, '등록된 구단이 없습니다.'));

  const cols = RIFT.clubCols();
  const max = Math.max(...RIFT.clubs.map((c) => c.reputation || 0), 1);

  const cell = (c, col) => {
    if (col.bar)
      return `<td><div class="bar-cell">
          <div class="bar"><i style="width:${Math.round(((c.reputation || 0) / max) * 100)}%"></i></div>
          <span class="val">${nf(c.reputation)}</span></div></td>`;
    if (col.k === 'titles')
      return `<td class="c">${c.titles > 0 ? `<span class="chip"><i class="fa-solid fa-trophy"></i> ${c.titles}</span>` : '<span class="muted">—</span>'}</td>`;
    const raw = col.raw ? col.raw(c) : c[col.k];
    return `<td class="c ${col.k === 'wins' ? 'val' : 'muted'}">${nf(raw)}</td>`;
  };

  sortableTable({
    head, body, lead: ['순위', '구단'], cols, rows: RIFT.clubs, defaultKey: 'wins',
    rowHtml: (c, i, def) => `
      <tr data-club="${c.name}">
        <td class="c">${def ? medal(i) : `<span class="medal">${i + 1}</span>`}</td>
        <td><span class="name">${c.name}</span></td>
        ${cols.map((col) => cell(c, col)).join('')}
      </tr>`,
  });
}

/* =========================================================
   경기
   ========================================================= */
function renderMatches() {
  const box = $('#matches');
  if (!box) return;
  if (!RIFT.matches.length) return void (box.innerHTML = `<div class="empty">예정된 경기가 없습니다.</div>`);
  box.innerHTML = RIFT.matches
    .map((m) => {
      const w = when(m.starts_at);
      return `
      <article class="match">
        <div class="match-media"><img class="shot" src="${m.image_url || RIFT.image('match')}" alt=""></div>
        <div class="match-fade">
          <div class="match-when"><span class="match-time">${w.time}</span><span class="match-day">${w.date}</span></div>
          <div class="match-teams">
            <b data-club="${m.home}">${m.home}</b>
            <span class="match-vs">VS</span>
            <b data-club="${m.away}">${m.away}</b>
          </div>
          ${m.map ? `<div class="match-map">중앙 거점 · ${m.map}</div>` : ''}
        </div>
      </article>`;
    })
    .join('');
}

/* =========================================================
   홈 요약 리더보드
   ========================================================= */
function renderHomeBoards() {
  const cl = $('#homeClubs');
  if (cl && !RIFT.clubs.length) cl.innerHTML = emptyRow(4, '등록된 구단이 없습니다.');
  else if (cl) {
    cl.innerHTML = RIFT.clubs
      .slice(0, 5)
      .map(
        (c, i) => `
        <tr data-club="${c.name}">
          <td class="c">${medal(i)}</td>
          <td><span class="name">${c.name}</span></td>
          <td class="c val">${c.wins}승 ${c.losses}패</td>
          <td class="c muted">${c.set_diff ?? '—'}</td>
        </tr>`
      )
      .join('');
  }

  const pl = $('#homePlayers');
  if (pl && !RIFT.sorted('kills').length) pl.innerHTML = emptyRow(4, '기록이 아직 없습니다.');
  else if (pl) {
    pl.innerHTML = RIFT.sorted('kills')
      .slice(0, 5)
      .map(
        (p, i) => `
        <tr data-player="${p.name}">
          <td class="c">${medal(i)}</td>
          <td><div class="who">${skinHead(p.name)}<span class="name">${p.name}</span></div></td>
          <td class="c"><span class="chip">${p.job}</span></td>
          <td class="c val">${nf(p.kills)}</td>
        </tr>`
      )
      .join('');
  }
}

/* =========================================================
   랭킹 페이지
   ========================================================= */
function renderRanking() {
  const seg = $('#rankSeg');
  if (!seg) return;
  const boards = RIFT.boards();
  const podium = $('#podium');
  const thead = $('#rankHead');
  const tbody = $('#rankBody');

  // 시상대는 그 랭킹의 대표 지표(킬 랭킹이면 킬) 기준을 유지합니다.
  // 표 정렬을 바꿔도 시상대는 흔들리지 않습니다.
  function drawPodium(rows, sub, valText) {
    podium.innerHTML = [1, 0, 2]
      .map((i) => {
        const r = rows[i];
        if (!r) return '';
        const face = r.__club
          ? `<div class="pod-av pod-emblem"><i class="fa-solid fa-shield-halved"></i></div>`
          : skinHead(r.name, i === 0 ? 38 : 29, 'pod-av');
        const attr = r.__club ? `data-club="${r.name}"` : `data-player="${r.name}"`;
        return `
        <div class="pod p${i + 1}" ${attr}>
          <div class="pod-crown"><i class="fa-solid fa-crown"></i></div>
          ${face}
          <div class="pod-name">${r.name}</div>
          <div class="pod-sub">${sub(r)}</div>
          <div class="pod-val">${valText(r)}</div>
          <div class="pod-block"><span class="pod-rank">${i + 1}</span></div>
        </div>`;
      })
      .join('');
  }

  function drawClub() {
    const rows = RIFT.clubs.map((c) => Object.assign({ __club: true }, c));
    if (!rows.length) {
      podium.innerHTML = '';
      thead.innerHTML = '';
      tbody.innerHTML = emptyRow(1, '등록된 구단이 없습니다.');
      return;
    }
    drawPodium(rows, (c) => `${c.wins}승 ${c.losses}패`, (c) => `${nf(c.reputation)} 인지도`);

    // 시상대 아래 표에서는 인지도를 막대 없이 숫자로만 보여줍니다.
    const cols = RIFT.clubCols().map((c) => (c.bar ? { k: c.k, label: c.label, num: true } : c));
    sortableTable({
      head: thead, body: tbody, lead: ['순위', '구단'], cols, rows, defaultKey: 'wins',
      rowHtml: (c, i, def) => `
        <tr data-club="${c.name}">
          <td class="c">${def ? medal(i) : `<span class="medal">${i + 1}</span>`}</td>
          <td><span class="name">${c.name}</span></td>
          ${cols.map((col) => `<td class="c ${col.k === 'wins' ? 'val' : 'muted'}">${nf(col.raw ? col.raw(c) : c[col.k])}</td>`).join('')}
        </tr>`,
    });
  }

  function draw(key) {
    if (key === 'club') return drawClub();
    const b = boards[key];
    const rows = RIFT.sorted(b.key);
    if (!rows.length) {
      podium.innerHTML = '';
      thead.innerHTML = '';
      tbody.innerHTML = emptyRow(1, `${b.label} 기록이 아직 없습니다.`);
      return;
    }
    drawPodium(rows, (p) => p.job, (p) => `${nf(p[b.key])} ${b.unit}`);

    sortableTable({
      head: thead, body: tbody, lead: ['순위', '플레이어'], cols: b.cols, rows, defaultKey: b.key,
      rowHtml: (p, i, def) => `
        <tr data-player="${p.name}">
          <td class="c">${def ? medal(i) : `<span class="medal">${i + 1}</span>`}</td>
          <td><div class="who">${skinHead(p.name)}<span class="name">${p.name}</span></div></td>
          ${b.cols
            .map((col) => {
              const v = col.get ? col.get(p) : p[col.k];
              if (col.chip) return `<td class="c"><span class="chip">${v}</span></td>`;
              return `<td class="c ${col.k === b.key ? 'val' : 'muted'}">${nf(v)}</td>`;
            })
            .join('')}
        </tr>`,
    });
  }

  draw($('.active', seg).dataset.rank);
  $$('button', seg).forEach((btn) =>
    btn.addEventListener('click', () => {
      $$('button', seg).forEach((x) => x.classList.remove('active'));
      btn.classList.add('active');
      draw(btn.dataset.rank);
    })
  );
}

/* =========================================================
   호버 카드 — 마우스를 따라다니며 선수/구단 정보를 보여줍니다
   ========================================================= */
function initHoverCard() {
  const pop = document.createElement('div');
  pop.className = 'profile';
  document.body.append(pop);
  let current = null;

  const playerCard = (p) => {
    const fb =
      'data:image/svg+xml;utf8,' +
      encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="60" height="124"><rect width="60" height="124" fill="#353542"/></svg>`);
    return `
      <div class="profile-top">
        <img class="profile-skin" src="https://mc-heads.net/body/${encodeURIComponent(p.name)}/60"
             alt="" onerror="this.onerror=null;this.src='${fb}'">
        <div>
          <div class="profile-name">${p.name}</div>
          <div class="profile-sub">
            <span class="chip">${p.job}</span>
            <span class="chip">${p.club || '무소속'}</span>
          </div>
        </div>
      </div>
      <div class="profile-rows">
        <div><span>킬 / 데스</span><b>${nf(p.kills)} / ${nf(p.deaths)}</b></div>
        <div><span>K/D</span><b>${kd(p)}</b></div>
        <div><span>플레이타임</span><b>${nf(p.playtime)}시간</b></div>
        <div><span>보유 자금</span><b>${won(p.money)}</b></div>
        <div style="grid-column:1/-1"><span>걸린 현상금</span><b>${won(p.bounty)}</b></div>
      </div>`;
  };

  const clubCard = (c) => `
      <div class="profile-top">
        <div class="profile-emblem"><i class="fa-solid fa-shield-halved"></i></div>
        <div>
          <div class="profile-name">${c.name}</div>
          <div class="profile-sub">
            <span class="chip">${c.wins}승 ${c.losses}패</span>
            <span class="chip">우승 ${c.titles || 0}회</span>
          </div>
        </div>
      </div>
      <div class="profile-rows">
        <div><span>구단주</span><b>${c.owner || '—'}</b></div>
        <div><span>로스터</span><b>${c.roster ?? '—'}명</b></div>
        <div><span>인지도</span><b>${nf(c.reputation)}</b></div>
        <div><span>세트 득실</span><b>${c.set_diff ?? '—'}</b></div>
      </div>`;

  const place = (x, y) => {
    const w = pop.offsetWidth || 280;
    const h = pop.offsetHeight || 240;
    const gap = 18;
    let left = x + gap;
    let top = y + gap;
    if (left + w > innerWidth - 10) left = x - w - gap;
    if (top + h > innerHeight - 10) top = y - h - gap;
    // 어떤 경우에도 화면 밖으로 나가지 않도록
    left = Math.max(10, Math.min(left, innerWidth - w - 10));
    top = Math.max(10, Math.min(top, innerHeight - h - 10));
    pop.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
  };

  const show = (el, x, y) => {
    const html = el.dataset.player
      ? (RIFT.player(el.dataset.player) ? playerCard(RIFT.player(el.dataset.player)) : null)
      : (RIFT.club(el.dataset.club) ? clubCard(RIFT.club(el.dataset.club)) : null);
    if (!html) return;
    pop.innerHTML = html;
    current = el;
    pop.classList.add('show');
    place(x, y);
  };
  const hide = () => {
    current = null;
    pop.classList.remove('show');
  };

  document.addEventListener('mouseover', (e) => {
    const el = e.target.closest('[data-player],[data-club]');
    if (el && el !== current) show(el, e.clientX, e.clientY);
    else if (!el && current) hide();
  });
  document.addEventListener('mousemove', (e) => {
    if (!current) return;
    if (!current.isConnected || !e.target.closest('[data-player],[data-club]')) return hide();
    place(e.clientX, e.clientY);
  });
  addEventListener('scroll', hide, { passive: true });
  // 터치 환경
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-player],[data-club]');
    if (!el) return hide();
    const r = el.getBoundingClientRect();
    el === current ? hide() : show(el, r.left + r.width / 2, r.bottom);
  });
}

/* =========================================================
   도움말 목차
   ========================================================= */
function initGuide() {
  const toc = $('#toc');
  const doc = $('.doc');
  if (!toc || !doc) return;

  /* ---------- 접고 펼치는 섹션 ---------- */
  const kids = [...doc.children];
  let body = null;
  kids.forEach((el) => {
    if (el.tagName === 'H2') {
      const sec = document.createElement('section');
      sec.className = 'doc-sec open';
      doc.append(sec);

      const label = el.textContent;
      el.textContent = '';
      const btn = document.createElement('button');
      btn.className = 'doc-toggle';
      btn.setAttribute('aria-expanded', 'true');
      btn.innerHTML = `<i class="fa-solid fa-chevron-down"></i><span>${label}</span>`;
      el.append(btn);
      sec.append(el);

      body = document.createElement('div');
      body.className = 'doc-body';
      const inner = document.createElement('div');
      body.append(inner);
      sec.append(body);
      body = inner;

      btn.addEventListener('click', () => {
        const open = sec.classList.toggle('open');
        btn.setAttribute('aria-expanded', String(open));
      });
    } else if (body) {
      body.append(el);
    }
  });

  const secs = $$('.doc-sec', doc);
  const setAll = (open) =>
    secs.forEach((s) => {
      s.classList.toggle('open', open);
      $('.doc-toggle', s).setAttribute('aria-expanded', String(open));
    });

  const bar = document.createElement('div');
  bar.className = 'doc-bar';
  bar.innerHTML = `<button class="btn btn-soft btn-sm" id="docToggleAll"><i class="fa-solid fa-chevron-up"></i> 모두 접기</button>`;
  doc.prepend(bar);
  let allOpen = true;
  $('#docToggleAll').addEventListener('click', (e) => {
    allOpen = !allOpen;
    setAll(allOpen);
    e.currentTarget.innerHTML = allOpen
      ? '<i class="fa-solid fa-chevron-up"></i> 모두 접기'
      : '<i class="fa-solid fa-chevron-down"></i> 모두 펼치기';
  });

  /* ---------- 목차 ---------- */
  const links = $$('a', toc).concat($$('#tocMobile a'));
  const targets = [...new Set(links.map((a) => $(a.getAttribute('href'))).filter(Boolean))];

  // 접힌 섹션 안의 항목을 누르면 먼저 펼칩니다.
  links.forEach((a) =>
    a.addEventListener('click', () => {
      const t = $(a.getAttribute('href'));
      const sec = t && t.closest('.doc-sec');
      if (sec && !sec.classList.contains('open')) {
        sec.classList.add('open');
        $('.doc-toggle', sec).setAttribute('aria-expanded', 'true');
        setTimeout(() => t.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
      }
    })
  );

  const mark = (id) => {
    links.forEach((a) => a.classList.toggle('active', a.getAttribute('href') === '#' + id));
    toc._pill && toc._pill.toActive();
  };
  const sweep = () => {
    let cur = targets[0];
    for (const t of targets) {
      if (!t.offsetParent && t.tagName !== 'H2') continue; // 접힌 섹션 내부는 건너뜀
      if (t.getBoundingClientRect().top - 140 <= 0) cur = t;
    }
    if (innerHeight + scrollY >= document.body.scrollHeight - 4) cur = targets[targets.length - 1];
    if (cur) mark(cur.id);
  };
  sweep();
  addEventListener('scroll', sweep, { passive: true });
}

/* =========================================================
   움직이는 배경 — 호버/선택에 따라 배경 하나가 미끄러져 이동합니다.
   항목마다 배경이 켜졌다 꺼지는 방식 대신 사용합니다.
   ========================================================= */
function initPills() {
  const setup = (box, itemSel, mode) => {
    const pill = document.createElement('span');
    pill.className = 'pill';
    box.prepend(pill);

    const move = (el) => {
      if (!el) return void (pill.style.opacity = '0');
      const b = box.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      if (!r.width) return void (pill.style.opacity = '0');
      pill.style.width = r.width + 'px';
      pill.style.height = r.height + 'px';
      pill.style.transform = `translate(${r.left - b.left + box.scrollLeft}px, ${r.top - b.top + box.scrollTop}px)`;
      pill.style.opacity = '1';
    };
    // itemSel 이 "button, a" 처럼 여러 개일 수 있어 각각에 상태 클래스를 붙여야 합니다.
    const activeSel = itemSel
      .split(',')
      .map((s) => s.trim())
      .flatMap((s) => [s + '.active', s + '.current'])
      .join(',');
    const toActive = () => move($(activeSel, box));

    box._pill = { move, toActive };

    if (mode === 'nav') {
      // 누른 항목으로 배경이 미끄러진 뒤 이동합니다. (호버로는 움직이지 않습니다)
      $$(itemSel, box).forEach((el) =>
        el.addEventListener('click', (e) => {
          const href = el.getAttribute('href');
          move(el);
          if (!href || href.startsWith('#') || e.metaKey || e.ctrlKey || e.shiftKey) return;
          e.preventDefault();
          setTimeout(() => (location.href = el.href), 240);
        })
      );
    } else if (mode === 'tabs') {
      // 탭 전환은 페이지 이동이 없으므로 활성 항목만 따라갑니다.
      box.addEventListener('click', () => setTimeout(toActive, 0));
    }
    box.addEventListener('scroll', toActive, { passive: true });
    addEventListener('resize', toActive);
    document.fonts && document.fonts.ready.then(toActive);
    requestAnimationFrame(toActive);
  };

  const nav = $('#nav');
  if (nav) setup(nav, 'a', 'nav');
  $$('.seg').forEach((s) => setup(s, 'button, a', 'tabs'));
  const toc = $('#toc');
  if (toc) setup(toc, 'a', 'active');
}

/* =========================================================
   등장 애니메이션
   ========================================================= */
function initReveal() {
  const ANIMS = ['rv-up','rv-zoom','rv-left','rv-blur','rv-right','rv-tilt','rv-rise','rv-flip','rv-down','rv-swing'];
  const SEL = '.s-head, .card, .stat, .notice, .tbl-card, .plan, .item, .cta, .podium, .seg, .news-item, .feature, .job, .match, .step-row, .play-ip, .panel, .auth-card';

  const groups = new Map();
  $$(SEL).forEach((el) => {
    const key = el.closest('.section, .page-head, footer') || document.body;
    groups.set(key, [...(groups.get(key) || []), el]);
  });
  let seed = 0;
  groups.forEach((list) => {
    const off = seed++ * 3;
    list.forEach((el, i) => {
      el.classList.add('rv', ANIMS[(i + off) % ANIMS.length]);
      el.style.transitionDelay = Math.min(i, 6) * 60 + 'ms';
    });
  });

  const all = $$('.rv');
  const show = (el) => {
    el.classList.add('in');
    setTimeout(() => (el.style.transitionDelay = ''), 900);
  };
  if (!('IntersectionObserver' in window)) return all.forEach(show);

  const io = new IntersectionObserver(
    (es, obs) => es.forEach((e) => e.isIntersecting && (show(e.target), obs.unobserve(e.target))),
    { rootMargin: '0px 0px -6% 0px', threshold: 0.04 }
  );
  all.forEach((el) => io.observe(el));

  // 백업: 콜백이 돌지 않는 환경에서도 화면 안 요소는 보이도록
  const sweep = () =>
    $$('.rv:not(.in)').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.top < innerHeight && r.bottom > 0) show(el);
    });
  addEventListener('load', () => setTimeout(sweep, 800));
  addEventListener('scroll', sweep, { passive: true });
  document.addEventListener('visibilitychange', () => !document.hidden && setTimeout(sweep, 250));
}
