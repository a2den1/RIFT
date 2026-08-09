/* =========================================================
   RIFT — 내 정보
   프로필 수정, 경험치 확인, 구단 생성 · 이적 신청
   실제 규칙은 Supabase 함수와 RLS 가 강제합니다.
   ========================================================= */
(async () => {
  await RIFT.ready;

  const need = document.getElementById('needLogin');
  const box = document.getElementById('me');
  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  if (!RIFT.connected) {
    need.classList.remove('hidden');
    document.getElementById('needLoginMsg').textContent =
      'Supabase 가 연결되지 않았습니다. assets/js/config.js 를 확인해 주세요.';
    return;
  }
  if (!RIFT.user) {
    need.classList.remove('hidden');
    return;
  }

  const sb = RIFT.client;
  let profile = await RIFT.ensureProfile();
  if (!profile) {
    need.classList.remove('hidden');
    document.getElementById('needLoginMsg').textContent =
      '프로필 테이블을 찾을 수 없습니다. supabase/add-profiles.sql 을 실행해 주세요.';
    return;
  }
  box.classList.remove('hidden');

  /* ---------- 파일 업로드 (관리자 페이지와 같은 방식) ---------- */
  async function uploadImage(file, folder) {
    if (!file.type.startsWith('image/')) throw new Error('이미지 파일만 올릴 수 있습니다.');
    if (file.size > 10 * 1024 * 1024) throw new Error('10MB 이하만 올릴 수 있습니다.');
    const ext = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '');
    const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await sb.storage.from('site').upload(path, file);
    if (error) {
      throw new Error(
        /Bucket not found/i.test(error.message)
          ? 'site 버킷이 없습니다. supabase/add-storage.sql 을 실행해 주세요.'
          : error.message
      );
    }
    return sb.storage.from('site').getPublicUrl(path).data.publicUrl;
  }

  document.addEventListener('change', async (e) => {
    const f = e.target.closest('.upload-btn input[type="file"]');
    if (!f || !f.files[0]) return;
    const row = f.closest('.upload-row');
    const input = row.querySelector('input:not([type="file"])');
    row.classList.add('uploading');
    try {
      input.value = await uploadImage(f.files[0], 'clubs');
      toast('업로드했습니다.');
    } catch (err) {
      toast('업로드 실패: ' + err.message);
    }
    row.classList.remove('uploading');
    f.value = '';
  });

  /* ---------- 프로필 표시 ---------- */
  function paintProfile() {
    const name = profile.mc_name || RIFT.discordName || '이름 없음';
    const fb =
      'data:image/svg+xml;utf8,' +
      encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="80" height="165"><rect width="80" height="165" fill="#353542"/></svg>`);
    const skin = document.getElementById('meSkin');
    skin.src = profile.mc_name
      ? `https://mc-heads.net/body/${encodeURIComponent(profile.mc_name)}/80`
      : fb;
    skin.onerror = () => {
      skin.onerror = null;
      skin.src = fb;
    };

    document.getElementById('meName').textContent = name;
    const pr = document.getElementById('mePronouns');
    pr.hidden = !profile.pronouns;
    pr.textContent = profile.pronouns || '';

    document.getElementById('meTags').innerHTML =
      `<span class="chip">${esc(profile.job || '직업 미선택')}</span>` +
      `<span class="chip"><i class="fa-solid fa-shield-halved"></i> ${esc(profile.club || '무소속')}</span>` +
      `<span class="chip"><i class="fa-brands fa-discord"></i> ${esc(profile.discord_username || RIFT.discordName || '—')}</span>`;
    document.getElementById('meBio').textContent = profile.bio || '';

    const b = RIFT.levelBand(profile.xp || 0);
    document.getElementById('xpLevel').textContent = `Lv. ${b.level}`;
    document.getElementById('xpText').textContent = `${(profile.xp || 0).toLocaleString()} / ${b.to.toLocaleString()} XP`;
    document.getElementById('xpFill').style.width = b.pct + '%';

    const form = document.getElementById('profileForm');
    form.mc_name.value = profile.mc_name || '';
    form.pronouns.value = profile.pronouns || '';
    form.job.value = profile.job || '';
    form.bio.value = profile.bio || '';
  }

  document.getElementById('profileForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const btn = f.querySelector('button');
    btn.disabled = true;
    const patch = {
      mc_name: f.mc_name.value.trim(),
      pronouns: f.pronouns.value.trim() || null,
      job: f.job.value || null,
      bio: f.bio.value.trim() || null,
      updated_at: new Date().toISOString(),
    };
    const { error } = await sb.from('profiles').update(patch).eq('id', RIFT.user.id);
    btn.disabled = false;
    if (error) {
      return toast(
        /duplicate key/i.test(error.message) ? '이미 쓰이고 있는 닉네임입니다.' : '저장 실패: ' + error.message
      );
    }
    Object.assign(profile, patch);
    toast('저장했습니다.');
    paintProfile();
    paintClub();
  });

  /* ---------- 구단 ---------- */
  const call = async (fn, args) => {
    const { data, error } = await sb.rpc(fn, args);
    if (error) return { ok: false, error: error.message };
    return data;
  };

  async function paintClub() {
    const body = document.getElementById('clubBody');
    const lead = document.getElementById('clubLead');
    const { data: clubs } = await sb.from('clubs').select('*').order('name');
    const list = clubs || [];
    const mine = list.find((c) => c.name === profile.club);
    const owned = list.find((c) => c.owner_id === RIFT.user.id);

    const { data: myReq } = await sb
      .from('transfers')
      .select('*')
      .eq('player_id', RIFT.user.id)
      .order('created_at', { ascending: false })
      .limit(3);

    const reqHtml = (myReq || []).length
      ? `<h3 style="font-size:15px;margin-top:20px">내 이적 신청</h3>
         <div class="rows">${myReq
           .map(
             (t) => `<div class="row-item">
               <span class="${t.status === 'accepted' ? 'ok-dot' : t.status === 'pending' ? 'wait-dot' : 'no-dot'}">
                 <i class="fa-solid fa-${t.status === 'accepted' ? 'check' : t.status === 'pending' ? 'hourglass-half' : 'xmark'}"></i></span>
               <div class="grow"><b>${esc(t.to_club)}</b>
               <small>${t.status === 'pending' ? '대기 중' : t.status === 'accepted' ? '승인됨' : '거절됨'}${t.note ? ' · ' + esc(t.note) : ''}</small></div>
             </div>`
           )
           .join('')}</div>`
      : '';

    if (mine) {
      lead.textContent = owned ? '내가 만든 구단입니다.' : '소속된 구단입니다.';
      body.innerHTML = `
        <div class="club-card">
          ${mine.logo_url ? `<img src="${esc(mine.logo_url)}" alt="">` : `<div class="club-logo-none"><i class="fa-solid fa-shield-halved"></i></div>`}
          <div>
            <b>${esc(mine.name)}</b>
            <small>${mine.wins || 0}승 ${mine.losses || 0}패 · 로스터 ${mine.roster ?? 0}명 · 인지도 ${(mine.reputation || 0).toLocaleString()}</small>
            <small>구단주 ${esc(mine.owner || '—')}</small>
          </div>
        </div>
        ${owned ? '' : `<button class="btn btn-soft btn-sm" id="leaveBtn" style="margin-top:14px">구단 탈퇴</button>`}
        ${reqHtml}`;
      document.getElementById('leaveBtn')?.addEventListener('click', async () => {
        if (!confirm('정말 탈퇴할까요?')) return;
        const r = await call('leave_club');
        if (!r.ok) return toast(r.error);
        profile.club = null;
        toast('탈퇴했습니다.');
        paintProfile();
        paintClub();
      });
    } else {
      lead.textContent = '아직 소속된 구단이 없습니다. 새로 만들거나 이적을 신청하세요.';
      const ready = [
        [!!profile.mc_name, '마인크래프트 닉네임 등록'],
        [!!profile.job, '직업 선택'],
        [true, '구단 이름 2~16자'],
        [true, '구단 로고 이미지'],
      ];
      body.innerHTML = `
        <div class="ready-list">
          ${ready
            .map(
              ([ok, t]) =>
                `<div class="ready-item"><span class="${ok ? 'ok-dot' : 'no-dot'}"><i class="fa-solid fa-${ok ? 'check' : 'xmark'}"></i></span>${t}</div>`
            )
            .join('')}
        </div>

        <h3 style="font-size:15px;margin-top:22px">구단 만들기</h3>
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

        <h3 style="font-size:15px;margin-top:24px">이적 신청</h3>
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

      document.getElementById('createForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('button');
        btn.disabled = true;
        const r = await call('create_club', { p_name: e.target.name.value, p_logo: e.target.logo.value.trim() });
        btn.disabled = false;
        if (!r.ok) return toast(r.error);
        profile.club = r.name;
        toast(`${r.name} 구단을 만들었습니다.`);
        paintProfile();
        paintClub();
        paintOwner();
      });

      document.getElementById('joinForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('button');
        btn.disabled = true;
        const r = await call('request_transfer', { p_club: e.target.club.value, p_note: e.target.note.value });
        btn.disabled = false;
        if (!r.ok) return toast(r.error);
        toast('신청을 보냈습니다. 구단주가 승인하면 소속이 바뀝니다.');
        paintClub();
      });
    }
  }

  /* ---------- 구단주 전용 ---------- */
  async function paintOwner() {
    const panel = document.getElementById('ownerPanel');
    const { data: owned } = await sb.from('clubs').select('*').eq('owner_id', RIFT.user.id).maybeSingle();
    if (!owned) return panel.classList.add('hidden');
    panel.classList.remove('hidden');
    document.getElementById('logoUrl').value = owned.logo_url || '';

    const { data: reqs } = await sb
      .from('transfers')
      .select('*')
      .eq('to_club', owned.name)
      .eq('status', 'pending')
      .order('created_at');
    const inc = document.getElementById('incoming');
    inc.innerHTML = (reqs || []).length
      ? reqs
          .map(
            (t) => `<div class="row-item">
              <div class="grow"><b>${esc(t.player_name || '이름 없음')}</b>
              <small>${t.from_club ? esc(t.from_club) + ' 소속' : '무소속'}${t.note ? ' · ' + esc(t.note) : ''}</small></div>
              <button class="btn btn-primary btn-sm" data-decide="${t.id}" data-accept="1">승인</button>
              <button class="btn btn-soft btn-sm" data-decide="${t.id}" data-accept="">거절</button>
            </div>`
          )
          .join('')
      : '<div class="empty">대기 중인 신청이 없습니다.</div>';

    const { data: members } = await sb.from('profiles').select('mc_name,job,pronouns').eq('club', owned.name);
    document.getElementById('roster').innerHTML = (members || []).length
      ? members
          .map(
            (m) => `<div class="row-item">
              <div class="grow"><b>${esc(m.mc_name || '이름 없음')}</b>
              <small>${esc(m.job || '직업 미선택')}${m.pronouns ? ' · ' + esc(m.pronouns) : ''}</small></div>
            </div>`
          )
          .join('')
      : '<div class="empty">등록된 선수가 없습니다.</div>';
  }

  document.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-decide]');
    if (!b) return;
    b.disabled = true;
    const r = await call('decide_transfer', { p_id: b.dataset.decide, p_accept: !!b.dataset.accept });
    b.disabled = false;
    if (!r.ok) return toast(r.error);
    toast(b.dataset.accept ? '영입했습니다.' : '거절했습니다.');
    paintOwner();
  });

  document.getElementById('logoSave').addEventListener('click', async () => {
    const r = await call('set_club_logo', { p_logo: document.getElementById('logoUrl').value.trim() });
    if (!r.ok) return toast(r.error);
    toast('로고를 바꿨습니다.');
    paintClub();
  });

  paintProfile();
  await paintClub();
  await paintOwner();
})();
