/* =========================================================
   RIFT — 구단 만들기 · 이적
   내 정보와 공식 리그 두 곳에서 같은 UI 를 씁니다.
   규칙은 전부 Supabase 함수와 RLS 가 강제합니다.
   ========================================================= */
(() => {
  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  let bound = false;

  window.mountClub = async function mountClub(root) {
    if (!root) return;
    await RIFT.ready;

    if (!RIFT.connected) {
      root.innerHTML = `<div class="empty">Supabase 가 연결되지 않아 구단 기능을 쓸 수 없습니다.</div>`;
      return;
    }
    if (!RIFT.user) {
      root.innerHTML = `
        <div class="empty" style="padding-bottom:18px">구단을 만들거나 이적을 신청하려면 로그인이 필요합니다.</div>
        <div style="text-align:center"><a href="login" class="btn btn-primary btn-sm">로그인</a></div>`;
      return;
    }

    const sb = RIFT.client;

    // 서로 기다릴 필요가 없는 요청이라 한 번에 보냅니다.
    const [profile, clubsRes, myReqRes] = await Promise.all([
      RIFT.ensureProfile(),
      sb.from('clubs').select('*').order('name'),
      sb.from('transfers').select('*').eq('player_id', RIFT.user.id)
        .order('created_at', { ascending: false }).limit(3),
    ]);

    if (!profile) {
      root.innerHTML = `<div class="empty">프로필 테이블이 없습니다. supabase/add-profiles.sql 을 실행해 주세요.</div>`;
      return;
    }

    const call = async (fn, args) => {
      const { data, error } = await sb.rpc(fn, args);
      return error ? { ok: false, error: error.message } : data;
    };

    const list = clubsRes.data || [];
    const mine = list.find((c) => c.name === profile.club);
    const owned = list.find((c) => c.owner_id === RIFT.user.id);
    const myReq = myReqRes.data || [];

    const reqHtml = (myReq || []).length
      ? `<h3 class="club-h3">내 이적 신청</h3>
         <div class="rows">${myReq.map((t) => `
           <div class="row-item">
             <span class="${t.status === 'accepted' ? 'ok-dot' : t.status === 'pending' ? 'wait-dot' : 'no-dot'}">
               <i class="fa-solid fa-${t.status === 'accepted' ? 'check' : t.status === 'pending' ? 'hourglass-half' : 'xmark'}"></i></span>
             <div class="grow"><b>${esc(t.to_club)}</b>
               <small>${t.status === 'pending' ? '대기 중' : t.status === 'accepted' ? '승인됨' : '거절됨'}${t.note ? ' · ' + esc(t.note) : ''}</small></div>
           </div>`).join('')}</div>`
      : '';

    /* ---------- 소속이 있을 때 ---------- */
    if (mine) {
      const [reqsRes, membersRes] = await Promise.all([
        owned
          ? sb.from('transfers').select('*').eq('to_club', owned.name).eq('status', 'pending').order('created_at')
          : Promise.resolve({ data: [] }),
        sb.from('profiles').select('mc_name,job,pronouns').eq('club', mine.name),
      ]);
      const reqs = reqsRes.data || [];
      const members = membersRes.data || [];

      root.innerHTML = `
        <div class="club-card">
          ${mine.logo_url ? `<img src="${esc(mine.logo_url)}" alt="">`
                          : `<div class="club-logo-none"><i class="fa-solid fa-shield-halved"></i></div>`}
          <div>
            <b>${esc(mine.name)}</b>
            <small>${mine.wins || 0}승 ${mine.losses || 0}패 · 로스터 ${mine.roster ?? 0}명 · 인지도 ${(mine.reputation || 0).toLocaleString()}</small>
            <small>구단주 ${esc(mine.owner || '—')}${owned ? ' (나)' : ''}</small>
          </div>
        </div>

        ${owned ? `
          <div class="field" style="margin-top:20px">
            <label>구단 로고</label>
            <div class="upload-row">
              <input id="clubLogoUrl" value="${esc(mine.logo_url || '')}" placeholder="주소를 넣거나 파일을 올리세요">
              <label class="btn btn-soft btn-sm upload-btn" title="파일 올리기">
                <i class="fa-solid fa-arrow-up-from-bracket"></i>
                <input type="file" accept="image/*" hidden>
              </label>
              <button class="btn btn-soft btn-sm" id="clubLogoSave">저장</button>
            </div>
          </div>

          <h3 class="club-h3">들어온 이적 신청</h3>
          <div class="rows">${(reqs || []).length ? reqs.map((t) => `
            <div class="row-item">
              <div class="grow"><b>${esc(t.player_name || '이름 없음')}</b>
                <small>${t.from_club ? esc(t.from_club) + ' 소속' : '무소속'}${t.note ? ' · ' + esc(t.note) : ''}</small></div>
              <button class="btn btn-primary btn-sm" data-decide="${t.id}" data-accept="1">승인</button>
              <button class="btn btn-soft btn-sm" data-decide="${t.id}">거절</button>
            </div>`).join('') : '<div class="empty">대기 중인 신청이 없습니다.</div>'}</div>

          <h3 class="club-h3">로스터</h3>
          <div class="rows">${(members || []).length ? members.map((m) => `
            <div class="row-item"><div class="grow"><b>${esc(m.mc_name || '이름 없음')}</b>
              <small>${esc(m.job || '직업 미선택')}${m.pronouns ? ' · ' + esc(m.pronouns) : ''}</small></div></div>`).join('')
            : '<div class="empty">등록된 선수가 없습니다.</div>'}</div>
        ` : `<button class="btn btn-soft btn-sm" id="leaveBtn" style="margin-top:16px">구단 탈퇴</button>`}
        ${reqHtml}`;

      root.querySelector('#leaveBtn')?.addEventListener('click', async () => {
        if (!confirm('정말 탈퇴할까요?')) return;
        const r = await call('leave_club');
        if (!r.ok) return toast(r.error);
        toast('탈퇴했습니다.');
        refreshAll();
      });
      root.querySelector('#clubLogoSave')?.addEventListener('click', async () => {
        const r = await call('set_club_logo', { p_logo: root.querySelector('#clubLogoUrl').value.trim() });
        if (!r.ok) return toast(r.error);
        toast('로고를 바꿨습니다.');
        refreshAll();
      });
      return;
    }

    /* ---------- 소속이 없을 때 ---------- */
    const ready = [
      [!!profile.mc_name, '마인크래프트 닉네임 등록', '내 정보에서 설정합니다'],
      [!!profile.job, '직업 선택', '내 정보에서 설정합니다'],
      [true, '구단 이름 2~16자', '중복되지 않는 이름'],
      [true, '구단 로고 이미지', '파일 업로드 또는 주소 입력'],
    ];

    root.innerHTML = `
      <div class="ready-list">
        ${ready.map(([ok, t, hint]) => `
          <div class="ready-item">
            <span class="${ok ? 'ok-dot' : 'no-dot'}"><i class="fa-solid fa-${ok ? 'check' : 'xmark'}"></i></span>
            <span class="grow">${t}</span><small class="muted">${hint}</small>
          </div>`).join('')}
      </div>
      ${!profile.mc_name || !profile.job ? `<a href="profile" class="btn btn-soft btn-sm" style="margin-top:14px">내 정보에서 채우기</a>` : ''}

      <h3 class="club-h3">구단 만들기</h3>
      <form id="createForm">
        <div class="field"><label>구단 이름</label><input name="name" maxlength="16" placeholder="2~16자" required></div>
        <div class="field">
          <label>구단 로고 (필수)</label>
          <div class="upload-row">
            <input name="logo" placeholder="주소를 넣거나 파일을 올리세요" required>
            <label class="btn btn-soft btn-sm upload-btn" title="파일 올리기">
              <i class="fa-solid fa-arrow-up-from-bracket"></i>
              <input type="file" accept="image/*" hidden>
            </label>
          </div>
        </div>
        <button class="btn btn-primary">구단 만들기</button>
      </form>

      <h3 class="club-h3">이적 신청</h3>
      <form id="joinForm">
        <div class="field">
          <label>구단 선택</label>
          <select name="club" required>
            <option value="">구단을 고르세요</option>
            ${list.map((c) => `<option>${esc(c.name)}</option>`).join('')}
          </select>
        </div>
        <div class="field"><label>남길 말 (선택)</label><input name="note" maxlength="80" placeholder="포지션, 가능 시간 등"></div>
        <button class="btn btn-soft">신청 보내기</button>
      </form>
      ${reqHtml}`;

    root.querySelector('#createForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector('button');
      btn.disabled = true;
      const r = await call('create_club', { p_name: e.target.name.value, p_logo: e.target.logo.value.trim() });
      btn.disabled = false;
      if (!r.ok) return toast(r.error);
      toast(`${r.name} 구단을 만들었습니다.`);
      refreshAll();
    });

    root.querySelector('#joinForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector('button');
      btn.disabled = true;
      const r = await call('request_transfer', { p_club: e.target.club.value, p_note: e.target.note.value });
      btn.disabled = false;
      if (!r.ok) return toast(r.error);
      toast('신청을 보냈습니다. 구단주가 승인하면 소속이 바뀝니다.');
      refreshAll();
    });
  };

  // 소속이 바뀌면 프로필 요약도 같이 갱신합니다.
  function refreshAll() {
    RIFT.profile = null;
    document.querySelectorAll('#clubMount').forEach((el) => window.mountClub(el));
    window.initProfilePage && window.initProfilePage();
  }

  /* ---------- 문서 전체에 한 번만 붙이는 처리 ---------- */
  if (!bound) {
    bound = true;

    document.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-decide]');
      if (!b) return;
      b.disabled = true;
      const { data, error } = await RIFT.client.rpc('decide_transfer', {
        p_id: b.dataset.decide,
        p_accept: b.hasAttribute('data-accept'),
      });
      b.disabled = false;
      const r = error ? { ok: false, error: error.message } : data;
      if (!r.ok) return toast(r.error);
      toast(b.hasAttribute('data-accept') ? '영입했습니다.' : '거절했습니다.');
      refreshAll();
    });

    document.addEventListener('change', async (e) => {
      const f = e.target.closest('.upload-row .upload-btn input[type="file"]');
      if (!f || !f.files[0] || f.dataset.slot) return; // 관리자 이미지 슬롯은 admin.js 가 처리
      const row = f.closest('.upload-row');
      const input = row.querySelector('input:not([type="file"])');
      row.classList.add('uploading');
      try {
        input.value = await window.riftUpload(f.files[0], 'clubs');
        toast('업로드했습니다.');
      } catch (err) {
        toast('업로드 실패: ' + err.message);
      }
      row.classList.remove('uploading');
      f.value = '';
    });
  }
})();
