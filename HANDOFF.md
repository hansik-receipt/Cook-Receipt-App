# 인수인계 — 요리 레시피 앱 (Cook-Receipt-App)

작성: 2026-10-13 · 기준 커밋 `de19aad` (이 문서를 추가한 커밋 직전) (브랜치 `claude/voice-recipe-app-8rjc7d`)

이 문서는 다른 계정·새 세션이 이 프로젝트를 이어받을 때 처음 읽는 문서다.
사용 방법과 설치 안내는 [README.md](README.md)에 있고, 이 문서는 **배경·결정 이력·구조·주의점·다음 할 일**을 다룬다.

---

## 1. 한눈에 보기

| 항목 | 내용 |
|---|---|
| 무엇 | 삼성 노트에 링크로 모아 두던 요리 레시피(유튜브·만개의레시피)를 앱으로 관리하고, 요리 중에 손 대지 않고(음성) 보는 PWA |
| 사용자 | 갤럭시 사용자 1인 (iOS는 고려하지 않기로 결정). 한국어로 소통 |
| 저장소 | `Hoyasiro/Cook-Receipt-App` (공개). 작업 브랜치 `claude/voice-recipe-app-8rjc7d`가 기본 브랜치 역할을 함 (`main` 없음) |
| 조직 저장소 | `hansik-receipt` 조직 쪽에서 PR #2가 들어옴 → README 설치 주소가 `https://hansik-receipt.github.io/Cook-Receipt-App/` 로 바뀜 |
| 배포 | GitHub Pages (GitHub Actions). push 하면 자동 배포. 원래 주소 `https://hoyasiro.github.io/Cook-Receipt-App/` |
| 서버 | **없음**. 데이터는 휴대폰 브라우저 localStorage 에만 있음 |
| 상태 | 단위 테스트 18개 통과, 배포 정상. 커밋하지 않은 변경 없음 |

## 2. 기술 스택

- Vue 3 (Composition API, `<script setup>`) + Vite **7** + vite-plugin-pwa (workbox generateSW) + Vitest
- 라우터·상태관리 라이브러리 없음. 모달은 `App.vue`의 `modal` ref + `history.pushState`(안드로이드 뒤로가기로 닫힘)
- 브라우저 API: Web Speech API(ko-KR 음성 인식·TTS), Wake Lock, Notification + Service Worker `showNotification`, Web Share Target, Web Audio(알람음), YouTube IFrame API

> ⚠️ **Vite 8로 올리지 말 것.** Vite 8(rolldown)에서는 코드가 바뀌어도 번들 파일 해시가 바뀌지 않는 경우가 있었다.
> 그러면 서비스워커 precache 목록이 같아져서 설치된 앱이 업데이트를 감지하지 못한다. `f6be9c6`에서 Vite 7로 고정했다.

## 3. 파일 구조

```
index.html
vite.config.js            PWA manifest(공유 대상·바로가기), workbox(이미지 캐시, sw-notify.js 포함), BASE_PATH, __APP_VERSION__
public/
  icon.svg, icon-192.png, icon-512.png
  sw-notify.js            알림 클릭 → 앱 창으로 이동 (workbox importScripts)
src/
  main.js                 앱 시작 + 서비스워커 등록·자동 업데이트(요리 모드 중에는 새로고침 보류)
  App.vue                 목록·검색·필터·정렬, 모달(추가/편집·가져오기·랜덤·메뉴·설치·빅스비 안내),
                          시작 파라미터(?title&text&url 공유, ?q, ?random, ?add), 앱 설치 버튼, 타이머 dock·종료 알람 화면
  style.css               전체 스타일 (라이트/다크 토큰)
  components/
    CookMode.vue          요리 모드: 한 단계씩 크게/전체 보기, 글씨 5단계, 음성 명령, 타이머 칩·패널, 유튜브 플레이어, Wake Lock
    DialPicker.vue        타이머 분·초 시계 다이얼 팝업
    ImportPanel.vue       삼성 노트 텍스트 일괄 가져오기, 백업/복원(JSON)
    RecipeCard.vue, RecipeForm.vue, Sheet.vue, Thumb.vue
  lib/
    recipes.js            순수 함수: URL·유튜브 ID·출처·카테고리 추측·노트 텍스트 해석·공유값 해석·검색
    store.js              localStorage 저장, 추가/수정/삭제, 썸네일·제목 채우기, 레시피 내용 미리 받기(prefetch)
    content.js            웹 레시피 → 재료·단계 (JSON-LD → 만개의레시피 DOM → 리더 텍스트 정리), 인스타그램 캡션 → 재료·순서·팁
    meta.js               썸네일·제목 (유튜브: i.ytimg + noembed, 그 외: microlink)
    voice.js              음성 명령 해석(parseCommand), 한국어 숫자, 연속 인식기, TTS
    timers.js             단계 문장 시간 인식, 타이머 저장·실행, 종료 알림·알람음
tests/recipes.test.js     단위 테스트 14개 (노트 해석, 공유, 검색, 음성 명령, JSON-LD, 텍스트 정리, 시간 인식)
tests/instagram.test.js   인스타그램 캡션 정리 4개 (실제 릴스 텍스트 형식)
.github/workflows/deploy.yml   push(main, claude/voice-recipe-app-8rjc7d)·수동 실행 → 테스트 → 빌드 → Pages 배포
```

## 4. 데이터 (휴대폰 localStorage)

| 키 | 내용 |
|---|---|
| `cook-recipes:v1` | 레시피 배열. `{id, url, title, category, memo, image, source, favorite, createdAt, openedAt, openCount, content?, contentFailedAt?}`. `content` = `{ingredients[], steps[{text,image?}], tips?[], text?, parser?, savedAt}` (재료 속 `[양념소스]` 는 소제목) |
| `cook-recipes:timers` | 실행 중·끝난 타이머 (`endAt` 종료 시각으로 저장 → 새로고침해도 이어짐) |
| `cook-recipes:font` / `view` / `voice` / `dial` | 요리 모드 글씨 크기, 보기 방식, 음성 켜짐, 다이얼 마지막 값 |

> ⚠️ **배포 주소(도메인)가 바뀌면 데이터가 따라오지 않는다.** localStorage는 주소(origin)별로 따로 저장된다.
> `hoyasiro.github.io` → `hansik-receipt.github.io` 로 옮기면, 옛 주소 앱에서 **메뉴 → 가져오기·백업 → 백업 파일 만들기** 후
> 새 주소 앱에서 **백업에서 복원** 해야 한다. 사용자에게 꼭 안내할 것.

## 5. 기능과 결정 이력 (커밋 순)

| 커밋 | 내용 | 사용자 요청·결정 |
|---|---|---|
| `e4afaff` | MVP: 카드 목록, 링크 추가, 노트 가져오기, 공유 대상, 딥링크, 백업 | "갤럭시만", "GitHub Pages로" |
| `562c18e` | 📲 앱 설치 버튼 | 크롬 메뉴 이름이 "설치 및 바로가기 만들기"라 찾지 못함 |
| `da767bf` | 요리 모드 + 음성 명령, 노트에서 공유하면 여러 링크 일괄 가져오기 | 삼성 노트 자동 연동은 API가 없어 불가 → 공유로 대체 |
| `2aaa0d9` | 원거리 가독성(한 단계씩 크게, 글씨 5단계, 큰 이전/다음), 내용 미리 저장(오프라인) | "거치대에 세워 두고 멀리서 봐도 보이게" |
| `5416ad5` | 음성 번호 이동 "7번으로", "끝으로", "맨 위로", "재료 화면으로" | |
| `d1be08e` | 스텝별 타이머 + 시스템 알림 | "카톡처럼 푸시 알림" → 서버 없이 로컬 알림으로 구현(한계는 7장) |
| `f6be9c6` | 새 버전 자동 적용, 메뉴에 버전 표시, Vite 7 고정 | 휴대폰에 옛 버전이 남아 ⏱ 버튼이 안 보였음 |
| `da2aa44` → `49ab230` | 타이머 30초 선택지 → 분·초 **시계 다이얼 팝업** | 텍스트 입력 대신 다이얼 |
| `05a8316` → `d4aadf6` | 유튜브 설명란·챕터로 단계 정리 → **되돌림(revert)** | "별로 효과가 없어". 테스트 영상 대부분 설명란에 레시피가 없었음 |
| `a152a5a`, `8a59062` | README 설치 안내 보강, 조직 주소로 변경 (다른 세션, PR #1·#2) | |
| (이번 PR) | 인스타그램 릴스: 리더 텍스트에서 캡션만 꺼내 사연·해시태그·댓글을 버리고 재료·순서·💡팁으로 정리, 원문은 접어서 보관 | "텍스트는 넘어오는데 필러가 많다" |

사용자가 선호하는 진행 방식:
- 한국어로, 짧고 실용적으로 답한다. 바꾸면 **테스트 → 빌드 → push → 배포 성공 확인**까지 하고 결과를 알린다.
- 실제 갤럭시에서 확인하지 못한 부분은 "확인 못 함"이라고 분명히 말한다.
- 사업 아이디어 메모는 공개 저장소에 두지 않기로 했다 (별도로 전달).

## 6. 외부 서비스 의존 (전부 무료·키 없음, 언제든 막힐 수 있음)

| 용도 | 서비스 | 실패 시 |
|---|---|---|
| 웹 레시피 HTML | `api.allorigins.win/raw` | 다음 단계로 |
| 리더(HTML·텍스트) | `r.jina.ai` | "앱 안에서 보여줄 수 없었어요" + 원본 열기 |
| 유튜브 제목 | `noembed.com` | 썸네일만 (i.ytimg는 ID로 직접) |
| 웹 썸네일·제목 | `api.microlink.io` (무료 한도 하루 약 50회) | 첫 글자 아이콘 |
| 영상 재생·제어 | YouTube IFrame API | — |

내용은 한 번 받으면 레시피에 저장되고, 실패한 링크는 6시간 뒤 다시 시도한다.

## 7. 알려진 한계

- **타이머 알림은 로컬 알림이다.** 앱이 살아 있을 때만 제시간에 울린다. 앱을 완전히 닫거나 오래 백그라운드에 두면 늦게 울릴 수 있고, 다시 열면 바로 울린다. 정확한 푸시를 하려면 서버(Web Push)가 필요하다.
- **음성 인식**은 크롬 Web Speech API에 의존한다. 다시 듣기 시작할 때마다 "띵" 소리가 날 수 있다. 영상 소리를 명령으로 잘못 알아듣지 않도록 14자가 넘는 문장은 무시한다.
- **유튜브 레시피는 영상 + 내 메모만** 보여준다. 단계 카드는 없다.
- 만개의레시피 추출은 사용자가 "원본처럼 잘 정리된다"고 확인했다. 다른 사이트는 JSON-LD가 있을 때만 잘 된다.
- **인스타그램은 캡션(설명 글)만** 읽는다. 영상 음성·화면 자막에만 있는 레시피는 못 가져온다. 정리는 규칙 기반(수량 단위·번호·조리 동사)이라 형식이 특이한 캡션은 놓칠 수 있다 → 원문 접기로 보완. 규칙을 바꾸면 `content.js` 의 `IG_PARSER` 를 올리면 저장된 인스타그램 내용을 다시 받는다.
- 다이얼은 최대 59분 59초다. 1시간 이상은 음성("1시간 타이머")이나 단계 문장 인식으로 맞춘다.

## 8. 개발·검증 방법

```bash
npm install
npm test                                         # 단위 테스트 (18개)
BASE_PATH=/Cook-Receipt-App/ npm run build       # 배포와 같은 경로로 빌드
npx vite preview --port 4173                     # http://localhost:4173/Cook-Receipt-App/
```

이 세션에서 쓴 브라우저 검증 방법 (Playwright + 미리 설치된 Chromium):
- **음성:** `window.SpeechRecognition` / `webkitSpeechRecognition` 을 가짜 클래스로 바꾸고 `onresult` 를 직접 호출해 "내려", "3번", "3분 타이머" 등을 흉내 냈다. (headless Chromium에도 진짜 `SpeechRecognition` 이 있어서 두 이름 다 덮어써야 한다)
- **유튜브 플레이어:** `window.YT = { Player: 가짜 }` 를 넣어 `seekTo` 호출을 기록했다.
- **외부 서비스:** `context.route()` 로 allorigins 응답을 JSON-LD가 든 가짜 HTML로 바꿨다.
- **알림:** `permissions: ['notifications']` 를 준 뒤 `registration.getNotifications()` 로 알림이 떴는지 확인했다.
- **업데이트 흐름:** `vite preview` 는 파일 목록을 캐시하므로, 다시 빌드하는 테스트에는 `python3 -m http.server` 로 `dist` 를 서비스해야 한다. "설치된 앱" 상태를 흉내 내려면 첫 방문 뒤 한 번 새로고침해서 서비스워커가 페이지를 제어하게 만든 다음 시험한다.
- 빌드 시각이 버전 문자열에 들어가므로, 같은 분(minute)에 빌드한 결과는 해시가 같을 수 있다.

## 9. 이관 체크리스트

- [ ] 새 계정에 `Hoyasiro/Cook-Receipt-App` (또는 `hansik-receipt` 조직 저장소) 쓰기 권한이 있는지 확인
- [ ] 어느 저장소·브랜치를 정본으로 할지 정하기 (지금은 두 곳에서 PR이 오감). 정본 저장소에서 **Settings → Pages → Source: GitHub Actions** 확인
- [ ] 정본에 `main` 을 쓰려면 기본 브랜치를 바꾸고 `deploy.yml` 의 `branches` 도 맞추기
- [ ] 배포 주소가 바뀌면 사용자에게 **백업 → 새 주소에서 복원**, 빅스비 빠른 명령어·딥링크 주소 갱신 안내
- [ ] 새 세션 시작 후 `npm test` 와 `BASE_PATH=/Cook-Receipt-App/ npm run build` 가 통과하는지 확인

## 10. 다음 후보 작업 (사용자와 논의된 것)

1. **(보류 — 쓸 일이 생기면 개발) 유튜브·인스타그램 영상 정리 B안:** Gemini가 영상을 직접 보고 재료·단계·단계별 영상 시각을 정리. API 키를 숨길 작은 서버(Cloudflare Workers 등)가 필요하다. A안(설명란·챕터)은 효과가 적어 되돌렸다. 코드는 `05a8316` 에 남아 있어서 장면 이동, 자동 따라가기 UI를 재활용할 수 있다. 인스타그램처럼 레시피가 캡션에 없고 영상(음성·자막)에만 있는 경우도 이 방식이 필요하다.
2. **정확한 타이머 푸시:** 서버 + Web Push.
3. **기기 간 동기화:** Firebase/Supabase 등. 지금은 백업 파일로만 옮길 수 있다.
4. 해외 사용자용 영어 번역, 상업화 전 법적 검토는 사용자 메모에 있다 (별도 전달).

## 11. 주의

- 같은 사용자의 다른 저장소 `Hoyasiro/codingmarathon` 의 `CLAUDE.md` 에 **원격 DB 접속 비밀번호가 평문으로** 들어 있다. 이 앱과는 무관하지만, 해당 줄을 지우고 비밀번호를 바꾸라고 권한 상태다.
- 커밋 메시지·PR에는 모델 이름을 적지 않는다.
