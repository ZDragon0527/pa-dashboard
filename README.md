# PA 업무 현황판 (공개용)

노션 4개 DB(팀 업무 추진현황·활동기록·요구사항·단체 마스터)와 구글 캘린더 'PA추진팀 일정'을 읽어
로그인 없이 볼 수 있는 공개용 현황판을 GitHub Pages로 게시합니다.

- 1시간마다 자동 갱신(GitHub Actions, 몇 분 늦을 수 있음)
- 공개하지 않는 항목: 요구사항·단체의 비고, 단체 성향, 활동 반응 (데이터 단계에서 제외)
- 데이터는 저장소에 남기지 않고 게시 페이지로만 내보냅니다
- 검색엔진 노출 안 함(noindex)

## 폴더 구성

| 경로 | 내용 |
|---|---|
| `.github/workflows/update.yml` | 매시간·수동·새로고침 버튼으로 실행되는 갱신 작업 |
| `scripts/refresh.js` | 노션 API·구글 캘린더 API로 데이터 받기 |
| `scripts/build-public.js` | 데이터를 넣은 `dist/index.html` 만들기 |
| `templates/` | 화면(HTML·CSS·JS) |
| `worker/trigger.js` | (선택) 새로고침 버튼이 갱신을 실행하게 하는 Cloudflare Worker |

## 저장소 설정 값 (Settings → Secrets and variables → Actions)

| 이름 | 종류 | 값 |
|---|---|---|
| `NOTION_TOKEN` | Secret | 노션 읽기 전용 연결 토큰 |
| `GOOGLE_SA_KEY` | Secret | 구글 서비스 계정 키 JSON 파일 내용 전체 |
| `CALENDAR_ID` | Variable(선택) | 비우면 PA추진팀 일정 |
| `TRIGGER_URL` | Variable(선택) | Cloudflare Worker 주소. 비우면 새로고침 버튼은 최신 게시본만 다시 불러옴 |

Settings → Pages → Source 는 **GitHub Actions** 로 둡니다.

## 새로고침 버튼으로 바로 갱신하기 (선택)

정적 페이지는 GitHub 토큰을 가질 수 없어서, 버튼이 갱신을 직접 실행하려면 중간 주소(Cloudflare Worker)가 필요합니다.

1. GitHub → Settings → Developer settings → Fine-grained tokens → 새 토큰: 이 저장소만, 권한 **Actions: Read and write**
2. Cloudflare → Workers & Pages → Create Worker → `worker/trigger.js` 내용 붙여넣고 배포
3. Worker 설정에 `GITHUB_TOKEN`(Secret), `REPO`(예: `아이디/pa-dashboard`), `ALLOWED_ORIGIN`(예: `https://아이디.github.io`) 추가
4. GitHub 저장소 Variables 에 `TRIGGER_URL` = Worker 주소 추가 후 Actions 에서 한 번 실행

Worker는 갱신이 진행 중이거나 5분 안에 이미 시작됐으면 새로 실행하지 않습니다.

## 참고

- 공개 저장소의 예약 실행은 저장소에 60일 동안 변경이 없으면 GitHub가 멈춥니다. 안내 메일이 오면 Actions 탭에서 다시 켜면 됩니다.
- 노션 링크는 노션 권한이 있는 사람만 열 수 있습니다.
