# gagyebu

의존성 없는 Node 24 가계부 CLI와 로컬 웹 보고서.

## 설치

Node.js 24 이상이 필요하다. 저장소를 복제한 폴더에서 `npm link`를 실행하면 `gagyebu` 명령을 쓸 수 있다. 같은 폴더에서 `node bin/gagyebu.js help`처럼 실행해도 된다.

## 데이터 파일 위치

데이터 경로는 명령의 `--data <경로>`, 환경 변수 `GAGYEBU_DATA`, 기본값 `~/.gagyebu/data.json` 순으로 정한다. 되돌리기 이력은 `<데이터 파일>.history.json`에 저장한다.

## 빠른 시작

빈 가계부에서 아래 명령을 순서대로 실행한다. `현금` 계좌와 `식비`, `교통`, `급여` 분류는 기본으로 들어 있다.

```sh
gagyebu category add 경조사
gagyebu account add 통장 --opening 1000000
gagyebu add 1만2천 --category 식비 --memo 점심
gagyebu add 3000 --date 어제 --category 교통
gagyebu add 300만 --type income --category 급여 --account 통장
gagyebu transfer 10만 --from 통장 --to 현금
gagyebu budget set 식비 30만
gagyebu summary
```

## 명령별 사용법

| 명령 | 하는 일 | 주요 옵션 |
| --- | --- | --- |
| `help` | 사용법과 명령 목록을 보여 줍니다. | — |
| `add` | 거래 하나를 더합니다. | `--type`, `--category`, `--account`, `--date`, `--memo`, `--tag` |
| `transfer` | 계좌 사이의 이체를 기록합니다. | `--from`, `--to`, `--date`, `--memo` |
| `recurring` | 매달 반복할 거래 규칙을 관리합니다. | `add --day <일>`, `list`, `rm`, `apply --month YYYY-MM`, `apply --dry-run` |
| `list` | 거래 목록을 보여 줍니다. | `--from`, `--to`, `--type`, `--category`, `--account`, `--tag`, `--json` |
| `search` | 글이나 태그로 거래를 찾습니다. | `--from`, `--to`, `--tag`, `--json` |
| `edit` | 거래의 값 일부를 바꿉니다. | `--amount`, `--category`, `--account`, `--date`, `--memo`, `--clear-tags` |
| `rm` | 거래 하나를 지웁니다. | `<번호>` |
| `category` | 분류 목록을 보고 분류를 더하거나 지웁니다. | `list`, `add`, `rm`, `--type` |
| `account` | 계좌 목록을 보고 계좌를 더하거나 지웁니다. | `list`, `add --opening <금액>`, `rm` |
| `balance` | 계좌별 잔액과 합계를 보여 줍니다. | `--date`, `--json` |
| `summary` | 한 달의 수입·지출과 분류별 합계를 보여 줍니다. | `--month`, `--json`, `--chart` |
| `stats` | 기간의 지출 통계를 보여 줍니다. | `--from`, `--to`, `--json` |
| `report` | 한 해의 달별 수입·지출을 보여 줍니다. | `--year`, `--json`, `--chart` |
| `export` | 거래를 CSV로 내보냅니다. | `--out`, `--from`, `--to`, `--force` |
| `import` | CSV 파일의 거래를 더합니다. | `--dry-run` |
| `budget` | 분류별 월 예산을 정하고 사용률을 보여 줍니다. | `set`, `list`, `rm`, `list --json` |
| `undo` | 마지막으로 바꾼 데이터를 되돌립니다. | `--list`, `--json` |
| `backup` | 데이터를 백업하거나 백업 목록을 보여 줍니다. | `--dir`, `--list`, `--list --json` |
| `restore` | 백업에서 데이터를 복원합니다. | `--yes` |
| `serve` | JSON API와 보고서 화면 웹 서버를 띄웁니다. | `--port` |

각 명령의 전체 사용법은 `gagyebu <명령> --help`로 본다.

`import`는 이체 행의 받는 계좌를 `to_account` 칸에서 읽는다. 가져오기 전에 대상 가계부에 CSV의 계좌와 분류를 등록한다.

## 웹 화면 띄우기

`gagyebu serve`를 실행하고 브라우저에서 `http://127.0.0.1:4780/`을 열면 이번 달 보고서를 볼 수 있다. 다른 달을 보려면 `/?month=YYYY-MM`을 연다. 보고서 페이지의 거래 추가 폼에서 거래를 기록할 수 있다.

기본 포트는 `4780`이며 `gagyebu serve --port <번호>`로 바꿀 수 있다. JSON API는 같은 주소의 `/api/transactions`, `/api/summary`, `/api/report`에서 제공한다.

## 백업·되돌리기

- `gagyebu undo`는 마지막 데이터 변경을 되돌린다. `gagyebu undo --list`는 최대 20개의 최근 변경 이력을 보여 준다.
- `gagyebu backup`은 데이터를 `<데이터 폴더>/backups`에 저장한다. `--dir <폴더>`로 백업 폴더를 지정하고 `gagyebu backup --list`로 백업 목록을 볼 수 있다.
- `gagyebu restore <백업 파일> --yes`는 지정한 백업으로 현재 데이터를 복원한다.

## 종료 코드

| 코드 | 의미 |
| --- | --- |
| 0 | 성공 |
| 1 | 데이터·처리 오류 |
| 2 | 사용법 오류 |
