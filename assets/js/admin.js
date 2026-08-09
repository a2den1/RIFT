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

  if (!RIFT.connected) {
    denied.classList.remove('hidden');
    msg.textContent = 'Supabase가 연결되지 않았습니다. assets/js/config.js 에 URL과 anon key를 넣고 supabase/schema.sql 을 실행해 주세요.';
    return;
  }
  if (!RIFT.user) {
    denied.classList.remove('hidden');
    msg.textContent = '디스코드로 로그인한 뒤 다시 시도해 주세요.';
    return;
  }

  const sb = RIFT.client;

  /* ---------- 권한 진단 ----------
     화면의 관리자 판정과 DB(RLS)의 판정이 다를 수 있어서, DB 쪽 값을 직접 확인합니다. */
  async function diagnose() {
    const rows = document.getElementById('diagRows');
    const raw = document.getElementById('diagRaw');
    diagPanel.classList.remove('hidden');
    rows.innerHTML = '<div class="empty">확인 중…</div>';
    raw.textContent = '';

    const { data, error } = await sb.rpc('whoami');
    if (error) {
      rows.innerHTML = `
        <div class="row-item">
          <span class="no-dot"><i class="fa-solid fa-xmark"></i></span>
          <div class="grow"><b>진단 함수를 찾을 수 없습니다</b>
          <small>supabase/fix-admin.sql 을 SQL Editor에서 실행해 주세요. (${error.message})</small></div>
        </div>`;
      return null;
    }

    const line = (ok, title, sub) => `
      <div class="row-item">
        <span class="${ok ? 'ok-dot' : 'no-dot'}"><i class="fa-solid fa-${ok ? 'check' : 'xmark'}"></i></span>
        <div class="grow"><b>${title}</b><small>${sub ?? ''}</small></div>
      </div>`;

    rows.innerHTML =
      line(!!data.username, 'DB가 읽은 사용자명', data.username || '(비어 있음 — JWT에 사용자명이 없습니다)') +
      line(!!data.username, '비교에 쓰이는 값', data.normalized || '—') +
      line(!!data.discord_id, '디스코드 ID', data.discord_id || '(없음)') +
      line(data.is_admin, 'DB 관리자 판정', data.is_admin ? '통과 — 등록·삭제가 가능합니다' : 'admins 테이블에 일치하는 행이 없습니다') +
      line(data.jwt_role === 'authenticated', 'JWT 역할', data.jwt_role || '(없음)');

    raw.textContent = JSON.stringify(data, null, 2);
    return data;
  }
  document.getElementById('diagRefresh').addEventListener('click', diagnose);

  // DB 판정을 기준으로 화면을 엽니다. 화면 쪽 추정은 참고용입니다.
  const who = await diagnose();
  const dbAdmin = who ? who.is_admin : RIFT.isAdmin;

  if (!dbAdmin) {
    denied.classList.remove('hidden');
    msg.textContent = who
      ? `${who.username || '이 계정'} 에는 관리자 권한이 없습니다. 아래 진단 결과를 확인하세요.`
      : `${RIFT.discordName} 계정 확인에 실패했습니다. 아래 진단 결과를 확인하세요.`;
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
})();
