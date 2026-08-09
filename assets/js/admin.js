/* =========================================================
   RIFT — 관리자 페이지
   화면 노출은 여기서 막지만, 실제 권한은 Supabase RLS가 결정합니다.
   ========================================================= */
(async () => {
  await RIFT.ready;

  const panel = document.getElementById('adminPanel');
  const denied = document.getElementById('adminDenied');
  const msg = document.getElementById('deniedMsg');
  const diagPanel = document.getElementById('diagPanel');

  const line = (ok, title, sub) => `
    <div class="row-item">
      <span class="${ok ? 'ok-dot' : 'no-dot'}"><i class="fa-solid fa-${ok ? 'check' : 'xmark'}"></i></span>
      <div class="grow"><b>${title}</b><small>${sub ?? ''}</small></div>
    </div>`;

  document.getElementById('diagRaw2').addEventListener('click', () =>
    document.getElementById('diagRaw').classList.toggle('hidden')
  );

  if (!RIFT.connected) {
    denied.classList.remove('hidden');
    msg.textContent = 'Supabase가 연결되지 않았습니다. assets/js/config.js 에 URL과 anon key를 넣어 주세요.';
    document.getElementById('diagTables').innerHTML = line(false, 'Supabase 연결', 'config.js 의 url / anonKey 가 비어 있습니다');
    return;
  }

  const sb = RIFT.client;

  /* ---------- SQL 실행 여부 점검 ----------
     테이블과 함수가 실제로 있는지 하나씩 확인합니다.
     "SQL 을 돌렸는데도 안 된다" 는 경우 대부분 여기서 원인이 드러납니다. */
  const NEEDED = [
    ['admins', 'schema.sql'],
    ['notices', 'schema.sql'],
    ['events', 'schema.sql'],
    ['matches', 'schema.sql'],
    ['clubs', 'schema.sql'],
    ['players', 'schema.sql'],
    ['server_status', 'schema.sql'],
    ['site_images', 'add-images-locks.sql'],
    ['tab_locks', 'add-images-locks.sql'],
  ];

  async function checkTables() {
    const box = document.getElementById('diagTables');
    box.innerHTML = '<div class="empty">확인 중…</div>';
    const results = await Promise.all(
      NEEDED.map(async ([t, file]) => {
        const { error } = await sb.from(t).select('*', { head: true, count: 'exact' }).limit(1);
        return { t, file, ok: !error, msg: error?.message || '' };
      })
    );
    const { error: fnErr } = await sb.rpc('whoami');
    const fnOk = !fnErr;

    const missing = results.filter((r) => !r.ok);
    const files = [...new Set(missing.map((m) => m.file))];
    if (!fnOk) files.push('fix-admin.sql');

    box.innerHTML =
      results.map((r) => line(r.ok, `테이블 ${r.t}`, r.ok ? '있음' : `없음 — supabase/${r.file} 실행 필요`)).join('') +
      line(fnOk, '함수 whoami()', fnOk ? '있음' : `없음 — supabase/fix-admin.sql 실행 필요 (${fnErr?.message || ''})`) +
      (files.length
        ? `<div class="row-item"><span class="no-dot"><i class="fa-solid fa-triangle-exclamation"></i></span>
             <div class="grow"><b>실행이 필요한 파일: ${[...new Set(files)].join(', ')}</b>
             <small>이미 실행했다면 SQL Editor 에서 <code>notify pgrst, 'reload schema';</code> 를 한 번 더 돌려 주세요. 새 테이블을 API 가 아직 못 읽는 상태일 수 있습니다.</small></div></div>`
        : line(true, '스키마 준비 완료', '필요한 테이블과 함수가 모두 있습니다'));
    return { fnOk, missing };
  }

  /* ---------- 권한 진단 ---------- */
  async function diagnose() {
    const rows = document.getElementById('diagRows');
    const raw = document.getElementById('diagRaw');
    rows.innerHTML = '<div class="empty">확인 중…</div>';
    raw.textContent = '';

    if (!RIFT.user) {
      rows.innerHTML = line(false, '로그인', '디스코드로 로그인해야 권한을 확인할 수 있습니다');
      return null;
    }

    const { data, error } = await sb.rpc('whoami');
    if (error) {
      rows.innerHTML = line(false, '권한 확인 실패', `whoami() 함수가 없습니다. supabase/fix-admin.sql 을 실행해 주세요. (${error.message})`);
      return null;
    }

    rows.innerHTML =
      line(!!data.username, 'DB가 읽은 사용자명', data.username || '(비어 있음 — JWT에 사용자명이 없습니다)') +
      line(!!data.username, '비교에 쓰이는 값', data.normalized || '—') +
      line(!!data.discord_id, '디스코드 ID', data.discord_id || '(없음)') +
      line(data.is_admin, 'DB 관리자 판정', data.is_admin ? '통과 — 등록·삭제가 가능합니다' : 'admins 테이블에 일치하는 행이 없습니다') +
      line(data.jwt_role === 'authenticated', 'JWT 역할', data.jwt_role || '(없음)');

    raw.textContent = JSON.stringify(data, null, 2);
    return data;
  }

  const runAll = async () => {
    await checkTables();
    return diagnose();
  };
  document.getElementById('diagRefresh').addEventListener('click', runAll);

  // DB 판정을 기준으로 화면을 엽니다. 화면 쪽 추정은 참고용입니다.
  const who = await runAll();

  if (!RIFT.user) {
    denied.classList.remove('hidden');
    msg.textContent = '디스코드로 로그인한 뒤 다시 시도해 주세요.';
    return;
  }
  if (!who || !who.is_admin) {
    denied.classList.remove('hidden');
    msg.textContent = who
      ? `${who.username || '이 계정'} 에는 관리자 권한이 없습니다. 아래 점검 결과를 확인하세요.`
      : `계정 확인에 실패했습니다. 아래 점검 결과를 확인하세요.`;
    return;
  }

  panel.classList.remove('hidden');

  const LABEL = {
    notices: { title: (r) => r.title, sub: (r) => (r.body || '').slice(0, 60), order: 'created_at', asc: false },
    events: { title: (r) => r.title, sub: (r) => `${r.starts_at || ''}${r.ends_at ? ' — ' + r.ends_at : ''}`, order: 'starts_at', asc: true },
    matches: { title: (r) => `${r.home} vs ${r.away}`, sub: (r) => `${r.starts_at || ''}${r.map ? ' · ' + r.map : ''}`, order: 'starts_at', asc: true },
    admins: { title: (r) => r.discord_username, sub: () => '관리자', order: 'created_at', asc: true },
  };

  async function refresh(table) {
    const box = document.querySelector(`[data-list="${table}"]`);
    const cfg = LABEL[table];
    const { data, error } = await sb.from(table).select('*').order(cfg.order, { ascending: cfg.asc });
    if (error) {
      box.innerHTML = `<div class="empty">불러오지 못했습니다: ${error.message}</div>`;
      return;
    }
    if (!data.length) {
      box.innerHTML = `<div class="empty">등록된 항목이 없습니다.</div>`;
      return;
    }
    box.innerHTML = data
      .map(
        (r) => `
        <div class="row-item">
          <div class="grow">
            <b>${escapeHtml(cfg.title(r))}</b>
            <small>${escapeHtml(cfg.sub(r) || '')}</small>
          </div>
          <button class="row-del" data-del="${table}" data-id="${r.id}" title="삭제">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>`
      )
      .join('');
  }

  const escapeHtml = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // 등록
  document.querySelectorAll('form[data-table]').forEach((form) => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const table = form.dataset.table;
      const payload = {};
      new FormData(form).forEach((v, k) => {
        if (String(v).trim() !== '') payload[k] = v;
      });
      const btn = form.querySelector('button');
      btn.disabled = true;
      const { error } = await sb.from(table).insert(payload);
      btn.disabled = false;
      if (error) {
        if (/row-level security/i.test(error.message)) {
          toast('권한이 없습니다. 아래 권한 진단을 확인해 주세요.');
          diagnose();
          diagPanel.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else {
          toast('등록 실패: ' + error.message);
        }
        return;
      }
      form.reset();
      toast('등록했습니다.');
      refresh(table);
    });
  });

  // 삭제
  document.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-del]');
    if (!b) return;
    if (!confirm('이 항목을 삭제할까요?')) return;
    const { error } = await sb.from(b.dataset.del).delete().eq('id', b.dataset.id);
    if (error) return toast('삭제 실패: ' + error.message);
    toast('삭제했습니다.');
    refresh(b.dataset.del);
  });

  Object.keys(LABEL).forEach(refresh);

  /* =========================================================
     이미지 교체
     ========================================================= */
  async function renderImages() {
    const box = document.getElementById('imgSlots');
    const { data, error } = await sb.from('site_images').select('key,url');
    if (error) {
      box.innerHTML = `<div class="empty">site_images 테이블이 없습니다. supabase/add-images-locks.sql 을 실행해 주세요.</div>`;
      return;
    }
    const saved = Object.fromEntries((data || []).map((r) => [r.key, r.url]));
    box.innerHTML = RIFT_CONFIG.imageSlots
      .map(
        (s) => `
        <div class="img-slot">
          <img src="${escapeHtml(saved[s.key] || RIFT_CONFIG.images[s.key])}" alt=""
               onerror="this.style.opacity=.25">
          <div class="img-info">
            <b>${s.label}</b>
            <small>권장 ${s.size}</small>
            <div class="img-row">
              <input type="url" placeholder="https://... (비우면 기본값)"
                     value="${escapeHtml(saved[s.key] || '')}" data-img-key="${s.key}">
              <button class="btn btn-soft btn-sm" data-img-save="${s.key}">저장</button>
            </div>
          </div>
        </div>`
      )
      .join('');
  }

  document.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-img-save]');
    if (!b) return;
    const key = b.dataset.imgSave;
    const url = document.querySelector(`[data-img-key="${key}"]`).value.trim();
    b.disabled = true;
    const { error } = url
      ? await sb.from('site_images').upsert({ key, url, updated_at: new Date().toISOString() })
      : await sb.from('site_images').delete().eq('key', key);
    b.disabled = false;
    if (error) return toast('저장 실패: ' + error.message);
    toast(url ? '이미지를 바꿨습니다.' : '기본 이미지로 되돌렸습니다.');
    renderImages();
  });

  /* =========================================================
     탭 잠금
     ========================================================= */
  async function renderLocks() {
    const box = document.getElementById('lockRows');
    const { data, error } = await sb.from('tab_locks').select('page,locked,reason');
    if (error) {
      box.innerHTML = `<div class="empty">tab_locks 테이블이 없습니다. supabase/add-images-locks.sql 을 실행해 주세요.</div>`;
      return;
    }
    const byPage = Object.fromEntries((data || []).map((r) => [r.page, r]));
    box.innerHTML = RIFT_CONFIG.tabs
      .map((t) => {
        const r = byPage[t.page] || { locked: false, reason: '' };
        return `
        <div class="lock-item${r.locked ? ' on' : ''}">
          <div class="lock-head">
            <span class="${r.locked ? 'no-dot' : 'ok-dot'}"><i class="fa-solid fa-${r.locked ? 'lock' : 'lock-open'}"></i></span>
            <b class="grow">${t.label}</b>
            <button class="btn ${r.locked ? 'btn-primary' : 'btn-soft'} btn-sm" data-lock-toggle="${t.page}">
              ${r.locked ? '잠금 해제' : '잠그기'}
            </button>
          </div>
          <input placeholder="사유 (방문자에게 표시됩니다)" value="${escapeHtml(r.reason || '')}" data-lock-reason="${t.page}">
        </div>`;
      })
      .join('');
  }

  document.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-lock-toggle]');
    if (!b) return;
    const page = b.dataset.lockToggle;
    const reason = document.querySelector(`[data-lock-reason="${page}"]`).value.trim();
    const locking = b.textContent.trim() === '잠그기';
    b.disabled = true;
    const { error } = await sb
      .from('tab_locks')
      .upsert({ page, locked: locking, reason: reason || null, updated_at: new Date().toISOString() });
    b.disabled = false;
    if (error) return toast('변경 실패: ' + error.message);
    toast(locking ? '탭을 잠갔습니다.' : '잠금을 해제했습니다.');
    renderLocks();
  });

  renderImages();
  renderLocks();
})();
