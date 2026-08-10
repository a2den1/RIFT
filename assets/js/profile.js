/* =========================================================
   RIFT — 내 정보 (프로필 · 경험치)
   구단과 이적은 club.js 가 담당합니다.
   ========================================================= */
(() => {
  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const SKIN_FALLBACK =
    'data:image/svg+xml;utf8,' +
    encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="80" height="165"><rect width="80" height="165" fill="#353542"/></svg>`);

  window.initProfilePage = async function () {
    const box = document.getElementById('me');
    const need = document.getElementById('needLogin');
    if (!box || !need) return; // 다른 탭이면 아무것도 하지 않습니다

    await RIFT.ready;

    const show = (el) => {
      need.classList.toggle('hidden', el !== need);
      box.classList.toggle('hidden', el !== box);
    };

    if (!RIFT.connected) {
      show(need);
      document.getElementById('needLoginMsg').textContent =
        'Supabase 가 연결되지 않았습니다. assets/js/config.js 를 확인해 주세요.';
      return;
    }
    if (!RIFT.user) {
      show(need);
      return;
    }

    const sb = RIFT.client;
    const profile = await RIFT.ensureProfile();
    if (!profile) {
      show(need);
      document.getElementById('needLoginMsg').textContent =
        '프로필 테이블을 찾을 수 없습니다. supabase/add-profiles.sql 을 실행해 주세요.';
      return;
    }
    show(box);

    /* ---------- 표시 ---------- */
    const skin = document.getElementById('meSkin');
    skin.src = profile.mc_name
      ? `https://mc-heads.net/body/${encodeURIComponent(profile.mc_name)}/80`
      : SKIN_FALLBACK;
    skin.onerror = () => {
      skin.onerror = null;
      skin.src = SKIN_FALLBACK;
    };

    document.getElementById('meName').textContent = profile.mc_name || RIFT.discordName || '이름 없음';
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
    requestAnimationFrame(() => (document.getElementById('xpFill').style.width = b.pct + '%'));

    /* ---------- 수정 ---------- */
    const form = document.getElementById('profileForm');
    form.mc_name.value = profile.mc_name || '';
    form.pronouns.value = profile.pronouns || '';
    form.job.value = profile.job || '';
    form.bio.value = profile.bio || '';

    if (!form._bound) {
      form._bound = true;
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = form.querySelector('button');
        btn.disabled = true;
        const patch = {
          mc_name: form.mc_name.value.trim(),
          pronouns: form.pronouns.value.trim() || null,
          job: form.job.value || null,
          bio: form.bio.value.trim() || null,
          updated_at: new Date().toISOString(),
        };
        const { error } = await sb.from('profiles').update(patch).eq('id', RIFT.user.id);
        btn.disabled = false;
        if (error) {
          return toast(
            /duplicate key/i.test(error.message) ? '이미 쓰이고 있는 닉네임입니다.' : '저장 실패: ' + error.message
          );
        }
        RIFT.profile = null; // 다시 읽어오도록
        toast('저장했습니다.');
        window.initProfilePage();
        document.querySelectorAll('#clubMount').forEach((el) => window.mountClub && window.mountClub(el));
      });
    }
  };
})();
