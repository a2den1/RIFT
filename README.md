# RIFT 홈페이지

정적 사이트입니다. 빌드 과정 없이 파일을 그대로 올리면 됩니다.

```
index.html      홈
play.html       서버 접속
guide.html      도움말
league.html     공식 리그
ranking.html    랭킹
support.html    후원
login.html      로그인
admin.html      관리자 (권한 있는 계정만)

assets/js/config.js   설정 (서버 주소, Supabase 키, 이미지 경로)
assets/js/data.js     Supabase 미연결 시 사용할 샘플 데이터
assets/js/store.js    데이터 조회 + 로그인
assets/js/app.js      화면 렌더링
assets/js/admin.js    관리자 페이지
supabase/schema.sql   Supabase 테이블 · RLS 정책
```

## 1. Supabase 연결

**전체 절차는 [SETUP.md](SETUP.md) 에 단계별로 정리해 두었습니다.** 요약하면:

1. Supabase 프로젝트 생성
2. SQL Editor 에서 `supabase/schema.sql` 실행
3. 디스코드 OAuth 앱을 만들어 Supabase의 Discord 프로바이더에 연결
4. Authentication → URL Configuration 에 사이트 주소 등록
5. `assets/js/config.js` 의 `supabase.url` / `supabase.anonKey` 입력

연결 전에는 `data.js` 의 샘플 데이터로 화면이 동작하고, 디스코드 로그인은 비활성화됩니다.

## 2. 관리자

- 최초 관리자는 디스코드 사용자명 `_a2den.` 입니다 (`schema.sql` 에서 등록됨).
- 해당 계정으로 로그인하면 헤더에 **관리자** 탭이 나타납니다.
- 관리자 페이지에서 공지 · 이벤트 · 경기 · 관리자 계정을 등록하고 삭제할 수 있습니다.

권한 확인은 화면 표시용이고, 실제 차단은 `schema.sql` 의 RLS 정책이 담당합니다.
`admins` 테이블에 없는 계정은 브라우저에서 직접 요청해도 쓰기가 거부됩니다.
관리자를 바꾸려면 `admins` 테이블을 수정하세요.

## 3. 이미지 교체

관리자 페이지 → **이미지 교체** 에서 바꿉니다.

- **파일 올리기** — 업로드 버튼을 누르거나 칸 위로 파일을 끌어다 놓으면
  Supabase Storage 의 `site` 버킷에 올라가고 주소가 자동으로 채워집니다. (이미지, 10MB 이하)
- **주소 입력** — 이미 올려둔 이미지 주소를 붙여넣습니다.
- 칸을 비우고 저장하면 기본 이미지로 돌아갑니다.

공지와 경기 등록 폼에서도 같은 방식으로 파일을 올릴 수 있습니다.

| 키 | 쓰이는 곳 | 권장 크기 |
|---|---|---|
| `wild` | 홈 · 야생 블록 | 1600×900 |
| `league` | 홈 · 리그 블록 | 1600×900 |
| `news` | 공지에 이미지가 없을 때 | 1200×675 |
| `match` | 경기에 이미지가 없을 때 | 1200×900 |
| `job_attack` · `job_tank` · `job_range` · `job_support` | 홈 · 직업 카드 | 800×600 |

기본 이미지 자체를 바꾸려면 `assets/img/shots/` 의 파일을 교체하고
`assets/js/config.js` 의 `images` 경로를 고치면 됩니다.

## 4. 그 밖의 설정

`assets/js/config.js` 에서 서버 주소, 지원 버전, 디스코드 초대 링크,
Aiden Account 주소를 바꿀 수 있습니다.

## 5. 외부 의존성

- 폰트: Paperlogy · Pretendard (눈누, jsDelivr)
- 아이콘: Font Awesome 6 (cdnjs)
- 스킨 렌더: mc-heads.net
- Supabase JS v2 (jsDelivr)

로고는 `assets/img/rift-logo.svg` 와 `rift-icon.svg` 원본을 그대로 사용합니다.
