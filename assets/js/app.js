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

  renderNews();
  renderEvents();
  renderClubTable();
  renderMatches();
  renderHomeBoards();
  renderRanking();
  initGuide();
  initHoverCard();

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
   소식 · 이벤트
   ========================================================= */
function renderNews() {
  const box = $('#news');
  if (!box) return;
  const items = RIFT.notices.slice(0, 3);
  if (!items.length) return void (box.outerHTML = `<div class="empty">등록된 공지가 없습니다.</div>`);
  box.innerHTML = items
    .map(
      (n) => `
      <article class="news-item">
        <div class="news-media"><img class="shot" src="${n.image_url || CFG.images.news}" alt=""></div>
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

function renderClubTable() {
  const tb = $('#standings');
  if (!tb) return;
  if (!RIFT.clubs.length) return void (tb.innerHTML = emptyRow(8, '등록된 구단이 없습니다.'));
  const max = Math.max(...RIFT.clubs.map((c) => c.reputation || 0), 1);
  tb.innerHTML = RIFT.clubs
    .map(
      (c, i) => `
      <tr data-club="${c.name}">
        <td class="c">${medal(i)}</td>
        <td><span class="name">${c.name}</span></td>
        <td class="c muted">${nf(c.games)}</td>
        <td class="c val">${nf(c.wins)}</td>
        <td class="c muted">${nf(c.losses)}</td>
        <td class="c">${c.set_diff ?? '—'}</td>
        <td>
          <div class="bar-cell">
            <div class="bar"><i style="width:${Math.round(((c.reputation || 0) / max) * 100)}%"></i></div>
            <span class="val">${nf(c.reputation)}</span>
          </div>
        </td>
        <td class="c">${c.titles > 0 ? `<span class="chip"><i class="fa-solid fa-trophy"></i> ${c.titles}</span>` : '<span class="muted">—</span>'}</td>
      </tr>`
    )
    .join('');
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
        <div class="match-media"><img class="shot" src="${m.image_url || CFG.images.match}" alt=""></div>
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

  function drawClub() {
    const rows = RIFT.clubs;
    if (!rows.length) {
      podium.innerHTML = '';
      thead.innerHTML = '';
      tbody.innerHTML = emptyRow(1, '등록된 구단이 없습니다.');
      return;
    }
    podium.innerHTML = [1, 0, 2]
      .map((i) => {
        const c = rows[i];
        if (!c) return '';
        return `
        <div class="pod p${i + 1}" data-club="${c.name}">
          <div class="pod-crown"><i class="fa-solid fa-crown"></i></div>
          <div class="pod-av pod-emblem"><i class="fa-solid fa-shield-halved"></i></div>
          <div class="pod-name">${c.name}</div>
          <div class="pod-sub">${c.wins}승 ${c.losses}패</div>
          <div class="pod-val">${nf(c.reputation)} 인지도</div>
          <div class="pod-block"><span class="pod-rank">${i + 1}</span></div>
        </div>`;
      })
      .join('');
    thead.innerHTML = ['순위', '구단', '승', '패', '인지도', '역대 우승']
      .map((c, i) => `<th class="${i === 1 ? '' : 'c'}">${c}</th>`)
      .join('');
    tbody.innerHTML = rows
      .map(
        (c, i) => `
        <tr data-club="${c.name}">
          <td class="c">${medal(i)}</td>
          <td><span class="name">${c.name}</span></td>
          <td class="c val">${c.wins}</td>
          <td class="c muted">${c.losses}</td>
          <td class="c val">${nf(c.reputation)}</td>
          <td class="c">${c.titles || 0}회</td>
        </tr>`
      )
      .join('');
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

    podium.innerHTML = [1, 0, 2]
      .map((i) => {
        const p = rows[i];
        if (!p) return '';
        return `
        <div class="pod p${i + 1}" data-player="${p.name}">
          <div class="pod-crown"><i class="fa-solid fa-crown"></i></div>
          ${skinHead(p.name, i === 0 ? 38 : 29, 'pod-av')}
          <div class="pod-name">${p.name}</div>
          <div class="pod-sub">${p.job}</div>
          <div class="pod-val">${nf(p[b.key])} ${b.unit}</div>
          <div class="pod-block"><span class="pod-rank">${i + 1}</span></div>
        </div>`;
      })
      .join('');

    thead.innerHTML = b.cols.map((c, i) => `<th class="${i === 1 ? '' : 'c'}">${c}</th>`).join('');
    tbody.innerHTML = rows
      .map(
        (p, i) => `
        <tr data-player="${p.name}">
          <td class="c">${medal(i)}</td>
          <td><div class="who">${skinHead(p.name)}<span class="name">${p.name}</span></div></td>
          <td class="c"><span class="chip">${p.job}</span></td>
          ${b.row(p).map((v, j) => `<td class="c ${j === 0 ? 'val' : 'muted'}">${nf(v)}</td>`).join('')}
        </tr>`
      )
      .join('');
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
  if (!toc) return;
  const links = $$('a', toc).concat($$('#tocMobile a'));
  const targets = [...new Set(links.map((a) => $(a.getAttribute('href'))).filter(Boolean))];
  const mark = (id) => links.forEach((a) => a.classList.toggle('active', a.getAttribute('href') === '#' + id));
  const sweep = () => {
    let cur = targets[0];
    for (const t of targets) if (t.getBoundingClientRect().top - 140 <= 0) cur = t;
    if (innerHeight + scrollY >= document.body.scrollHeight - 4) cur = targets[targets.length - 1];
    if (cur) mark(cur.id);
  };
  sweep();
  addEventListener('scroll', sweep, { passive: true });
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
