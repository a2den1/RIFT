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

  let pollTimer = null;

  /* =========================================================
     마인크래프트 계정 인증
     사이트에서 코드를 받고, 게임 안에서 /웹인증 <코드> 를 쳐야 연결됩니다.
     게임에 접속할 수 있는 사람만 자기 닉네임을 등록할 수 있습니다.
     ========================================================= */
  const verified = (box, name, auto) => {
    box.innerHTML = `
      <div class="verify-done">
        <span class="ok-dot"><i class="fa-solid fa-check"></i></span>
        <div class="grow">
          <b>${esc(name)}</b>
          <small>${auto
            ? '게임 내 디스코드 연동 기록을 확인해 자동으로 인증했습니다.'
            : '인증된 마인크래프트 계정입니다. 바꾸려면 관리자에게 문의해 주세요.'}</small>
        </div>
      </div>`;
  };

  async function paintVerify(sb, profile) {
    const box = document.getElementById('verifyBox');
    if (!box) return;
    clearInterval(pollTimer);

    if (profile.mc_name) return verified(box, profile.mc_name, false);

    // 게임에서 이미 /디스코드연동 을 마쳤다면 코드 입력 없이 바로 붙습니다.
    box.innerHTML = `<div class="verify-need"><b>마인크래프트 계정 확인 중…</b></div>`;
    const { data: auto } = await sb.rpc('try_auto_link');
    if (auto && auto.ok && auto.name) {
      profile.mc_name = auto.name;
      verified(box, auto.name, !!auto.auto);
      if (auto.auto) {
        toast(`${auto.name} 계정을 자동으로 연결했습니다.`);
        document.getElementById('meName').textContent = auto.name;
      }
      return;
    }

    box.innerHTML = `
      <div class="verify-need">
        <b>마인크래프트 계정을 연결해 주세요</b>
        <p>닉네임은 직접 입력할 수 없습니다. 게임 안에서 인증해야 등록됩니다.<br>
           게임에서 <code>/디스코드연동</code> 을 이미 하셨다면 여기서 자동으로 연결됩니다.</p>
        <button class="btn btn-primary btn-sm" id="verifyStart">인증 코드 받기</button>
      </div>`;

    document.getElementById('verifyStart').addEventListener('click', async (e) => {
      e.target.disabled = true;
      const { data, error } = await sb.rpc('request_mc_code');
      e.target.disabled = false;
      if (error) {
        return toast(
          /Could not find/i.test(error.message)
            ? '인증 기능이 아직 설치되지 않았습니다. supabase/add-mc-verify.sql 을 실행해 주세요.'
            : '코드 발급 실패: ' + error.message
        );
      }
      if (!data.ok) return toast(data.error);
      showCode(sb, data.code, data.expires_in || 600);
    });
  }

  function showCode(sb, code, seconds) {
    const box = document.getElementById('verifyBox');
    let left = seconds;

    box.innerHTML = `
      <div class="verify-code">
        <div class="vc-head">
          <b>게임에 접속해서 아래 명령어를 입력하세요</b>
          <span class="vc-timer" id="vcTimer"></span>
        </div>
        <button class="vc-cmd" id="vcCopy" title="눌러서 복사">
          <code>/웹인증 ${code}</code>
          <i class="fa-regular fa-copy"></i>
        </button>
        <p>입력하면 이 화면이 자동으로 바뀝니다. 코드는 한 번만 쓸 수 있습니다.</p>
      </div>`;

    document.getElementById('vcCopy').addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(`/웹인증 ${code}`);
        toast('명령어를 복사했습니다.');
      } catch {
        toast('복사에 실패했습니다. 직접 입력해 주세요.');
      }
    });

    const timer = document.getElementById('vcTimer');
    const tick = async () => {
      left -= 3;
      if (timer) {
        const m = Math.max(0, Math.floor(left / 60));
        const s = Math.max(0, left % 60);
        timer.textContent = `${m}:${String(s).padStart(2, '0')} 남음`;
      }
      if (left <= 0) {
        clearInterval(pollTimer);
        RIFT.profile = null;
        window.initProfilePage();
        return;
      }
      // 게임에서 입력했는지 확인
      const { data } = await sb.from('profiles').select('mc_name').eq('id', RIFT.user.id).maybeSingle();
      if (data && data.mc_name) {
        clearInterval(pollTimer);
        toast(`${data.mc_name} 계정을 연결했습니다.`);
        window.initProfilePage();
        document.querySelectorAll('#clubMount').forEach((el) => window.mountClub && window.mountClub(el));
      }
    };
    timer.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')} 남음`;
    pollTimer = setInterval(tick, 3000);
  }

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

    const out = document.getElementById('signOutBtn');
    if (out && !out._bound) {
      out._bound = true;
      out.addEventListener('click', () => window.confirmSignOut && window.confirmSignOut());
    }

    /* ---------- 마인크래프트 계정 인증 ---------- */
    await paintVerify(sb, profile);

    /* ---------- 수정 ---------- */
    const form = document.getElementById('profileForm');
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
          pronouns: form.pronouns.value.trim() || null,
          job: form.job.value || null,
          bio: form.bio.value.trim() || null,
          updated_at: new Date().toISOString(),
        };
        const { error } = await sb.from('profiles').update(patch).eq('id', RIFT.user.id);
        btn.disabled = false;
        if (error) return toast('저장 실패: ' + error.message);
        RIFT.profile = null; // 다시 읽어오도록
        toast('저장했습니다.');
        window.initProfilePage();
        document.querySelectorAll('#clubMount').forEach((el) => window.mountClub && window.mountClub(el));
      });
    }
  };
})();
