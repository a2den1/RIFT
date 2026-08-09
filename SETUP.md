# RIFT — Supabase 설정 가이드

Supabase를 연결하지 않아도 사이트는 `assets/js/data.js` 의 샘플 데이터로 정상 동작합니다.
아래 설정을 마치면 리더보드 · 경기 일정 · 공지 · 이벤트가 실제 DB에서 오고, 로그인과 관리자 페이지가 켜집니다.

---

## 1단계 — Supabase 프로젝트 만들기

1. <https://supabase.com> 접속 → 로그인 → **New project**
2. 입력값
   - **Name**: `rift` (자유)
   - **Database Password**: 아무거나. 지금은 안 쓰지만 나중에 DB에 직접 붙을 때 필요하니 저장해 두세요.
   - **Region**: `Northeast Asia (Seoul)`
3. 생성까지 1~2분 걸립니다.

---

## 2단계 — 테이블과 권한 만들기 (SQL)

1. 왼쪽 메뉴 **SQL Editor** → **New query**
2. `supabase/schema.sql` 파일 내용을 **전부 복사해서 붙여넣기**
3. 오른쪽 아래 **Run** (또는 `Ctrl+Enter`)
4. `Success. No rows returned` 이 나오면 성공입니다.
5. 이어서 `supabase/add-images-locks.sql` 도 같은 방법으로 실행합니다.
   (이미지 교체와 탭 잠금 기능에 필요합니다.)

이미 예전 버전으로 만들어 둔 프로젝트라면 `supabase/fix-admin.sql` 도 한 번 실행해 주세요.

이 SQL이 하는 일:

| 만드는 것 | 설명 |
|---|---|
| `admins` | 관리자 목록. 디스코드 사용자명으로 판별합니다. `_a2den.` 이 미리 들어갑니다. |
| `notices` | 공지. 홈 "소식" 영역에 표시됩니다. |
| `events` | 이벤트. 홈 "진행 중인 이벤트" 영역. |
| `matches` | 경기 일정. 홈과 공식 리그 페이지의 "다음 경기". |
| `clubs` | 구단. 리그 순위표와 구단 랭킹. |
| `players` | 선수. 킬 · 플레이타임 · 게임머니 · 현상금 랭킹. |
| `is_admin()` | 지금 로그인한 사람이 관리자인지 판정하는 함수. |
| RLS 정책 | **읽기는 누구나, 쓰기는 관리자만.** |

> **여기가 진짜 보안선입니다.** 웹페이지의 "관리자 아님" 화면은 그냥 UI일 뿐이고,
> 실제 차단은 이 RLS 정책이 합니다. SQL을 실행하지 않으면 관리자 기능이 아예 동작하지 않습니다.

**다시 실행해도 안전합니다.** 테이블은 `if not exists`, 샘플 데이터는 `on conflict do nothing`,
정책은 `drop policy if exists` 후 재생성하도록 되어 있습니다.

---

## 3단계 — 디스코드 로그인 연결

### 3-1. Supabase에서 콜백 주소 확인

Supabase → **Authentication** → **Providers** → **Discord** 를 펼치면
`Callback URL (for OAuth)` 이 보입니다. 이런 모양입니다:

```
https://<프로젝트ID>.supabase.co/auth/v1/callback
```

이 주소를 복사해 두세요.

### 3-2. 디스코드 앱 만들기

1. <https://discord.com/developers/applications> → **New Application** → 이름 `RIFT`
2. 왼쪽 **OAuth2** 메뉴
3. **Redirects** → **Add Redirect** → 위에서 복사한 콜백 주소를 붙여넣고 **Save Changes**
4. 같은 화면의 **Client ID** 와 **Client Secret**(Reset Secret으로 발급) 을 복사

### 3-3. Supabase에 입력

Supabase → **Authentication** → **Providers** → **Discord**
- `Enable Sign in with Discord` 켜기
- `Client ID`, `Client Secret` 붙여넣기 → **Save**

### 3-4. 사이트 주소 등록

Supabase → **Authentication** → **URL Configuration**

- **Site URL**: 실제 사이트 주소 (예: `https://rift.kr`)
- **Redirect URLs**: 로그인 후 돌아올 주소를 등록합니다. 개발용 주소도 함께 넣어두세요.
  ```
  https://rift.kr/**
  http://localhost:5180/**
  ```

> 로그인은 `file://` 로 연 페이지에서는 동작하지 않습니다. 반드시 웹서버로 띄운 주소여야 합니다.

---

## 4단계 — 사이트에 키 넣기

Supabase → **Project Settings** → **API** 에서 두 값을 복사합니다.

- **Project URL**
- **Project API keys → `anon` `public`**

`assets/js/config.js` 를 열어 채웁니다.

```js
supabase: {
  url: 'https://xxxxxxxxxxxx.supabase.co',
  anonKey: 'eyJhbGciOi...',
},
```

`anon` 키는 공개되어도 되는 키입니다. 브라우저에 노출되는 게 정상이고,
쓰기 권한은 RLS가 막습니다. **`service_role` 키는 절대 여기에 넣지 마세요.**

---

## 5단계 — 확인

1. 사이트를 새로고침합니다. 리더보드 숫자가 Supabase에 넣은 값으로 바뀌면 연결된 것입니다.
2. 우측 상단 **로그인** → **디스코드로 로그인**
3. `_a2den.` 계정이면 헤더에 **관리자** 탭이 생깁니다.

---

## 관리자 관리

- 관리자 페이지 → **관리자 추가** 에 디스코드 **사용자명**을 넣습니다.
  표시 이름(닉네임)이 아니라 `_a2den.` 같은 소문자 사용자명입니다.
- 또는 Supabase **Table Editor → admins** 에서 직접 행을 추가해도 됩니다.
- 디스코드가 `_a2den.#0` 처럼 구분자를 붙여 보내는 경우가 있는데,
  사이트와 `is_admin()` 함수 양쪽에서 `#0` 을 떼고 비교하므로 `_a2den.` 로만 넣으면 됩니다.

### 관리자인데 권한이 없다고 나올 때

관리자 페이지에 `OOO 계정에는 관리자 권한이 없습니다` 라고 뜨는데, 이 `OOO` 가
**사이트가 인식한 실제 사용자명**입니다. 이 값을 그대로 `admins` 테이블에 넣으면 됩니다.

값이 비어 보이면 브라우저 콘솔에서 확인할 수 있습니다.

```js
RIFT.user.user_metadata
```

---

## 데이터 채우기

공지 · 이벤트 · 경기는 관리자 페이지에서 등록합니다.
**구단(`clubs`)과 선수(`players`)** 는 마인크래프트 서버가 갱신하는 값이라
관리자 페이지에 폼을 두지 않았습니다. 두 가지 방법이 있습니다.

**A. 수동** — Supabase **Table Editor** 에서 직접 편집

**B. 서버에서 자동 갱신** — 플러그인이나 외부 스크립트에서 REST API 호출.
이때는 `service_role` 키를 쓰고, **절대 브라우저에 노출하지 마세요.**

```bash
curl -X POST 'https://<프로젝트ID>.supabase.co/rest/v1/players' \
  -H "apikey: <service_role 키>" \
  -H "Authorization: Bearer <service_role 키>" \
  -H "Content-Type: application/json" \
  -H "Prefer: resolution=merge-duplicates" \
  -d '[{"name":"Aiden","job":"공격수","club":"NOVA","kills":412,"deaths":96,"playtime":389,"money":15970000,"bounty":4200000}]'
```

`name` 과 `clubs.name` 에 unique 제약이 있어서 `merge-duplicates` 로 upsert가 됩니다.

### 컬럼 정리

**players** — `name`(고유), `job`, `club`, `kills`, `deaths`, `playtime`(시간), `money`, `bounty`
**clubs** — `name`(고유), `owner`, `roster`, `games`, `wins`, `losses`, `set_diff`, `reputation`, `titles`
**matches** — `home`, `away`, `starts_at`(타임스탬프), `map`, `image_url`, `status`
**notices** — `title`, `body`, `image_url`
**events** — `title`, `body`, `starts_at`(날짜), `ends_at`

---

## 문제 해결

| 증상 | 원인과 해결 |
|---|---|
| 숫자가 계속 샘플 값 | `config.js` 의 url/anonKey가 비었거나 오타. 콘솔에 `[RIFT] ... 불러오기 실패` 경고가 있는지 확인 |
| 로그인 버튼을 눌러도 반응 없음 | Supabase 미설정. 로그인 페이지 하단 안내 문구 확인 |
| 로그인 후 에러 페이지 | 디스코드 Redirects에 Supabase 콜백 주소가 없거나, Supabase URL Configuration에 사이트 주소가 없음 |
| 로그인은 되는데 관리자 탭이 없음 | `admins` 테이블에 사용자명이 없음. 위의 "관리자인데 권한이 없다고 나올 때" 참고 |
| 관리자 페이지에서 등록 시 `new row violates row-level security` | RLS가 정상 작동 중인데 해당 계정이 관리자가 아님 |
| 관리자 페이지에서 등록 시 `relation does not exist` | `schema.sql` 을 실행하지 않았음 |
