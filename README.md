# PA 업무 현황판 (공개용)

노션 DB와 구글 캘린더 'PA추진팀 일정'을 읽어, 로그인 없이 볼 수 있는 공개용 현황판을 GitHub Pages로 게시합니다.

- GitHub Actions가 1시간마다 데이터를 받아 페이지를 다시 만듭니다(Actions 탭의 Run workflow로 바로 실행 가능).
- 비고, 단체 성향, 활동 반응은 공개하지 않습니다.
- 데이터는 저장소에 남기지 않고 게시 페이지로만 내보냅니다.

## 필요한 설정 (Settings → Secrets and variables → Actions)

| 이름 | 종류 | 값 |
|---|---|---|
| `NOTION_TOKEN` | Secret | 노션 읽기 전용 연결 토큰 |
| `GOOGLE_SA_KEY` | Secret | 구글 서비스 계정 키 JSON 내용 전체 |
| `CALENDAR_ID` | Variable(선택) | 비우면 PA추진팀 일정 |

Settings → Pages → Source 는 **GitHub Actions** 로 둡니다.

## 참고

공개 저장소의 예약 실행은 60일 동안 저장소 변경이 없으면 GitHub가 멈춥니다. 안내 메일이 오면 Actions 탭에서 다시 켭니다.
