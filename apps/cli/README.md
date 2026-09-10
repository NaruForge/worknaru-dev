# Worknaru CLI

AI Agent와 사용자가 Worknaru Core API를 호출하는 프로그램이다. 현재 명령은 `worknaru status`로, 명시한 Daemon의 상태를 조회한다.

## 설치와 실행

저장소 루트에서 실행한다. 검증 환경은 Windows, Node.js `24.18.0`, 루트 `packageManager`에 지정된 pnpm이다.

```powershell
pnpm install --frozen-lockfile --store-dir .pnpm-store
pnpm build
pnpm exec worknaru --help
```

상태 조회에는 실행 중인 Daemon이 필요하다. 전용 개발 환경을 계속 켜 두려면 다른 터미널의 저장소 루트에서 `pnpm web:dev`를 실행하고 준비 완료 주소가 출력될 때까지 기다린다. 그런 다음 원래 터미널에서 전용 서버 ID를 읽어 조회한다.

```powershell
$serverId = (Get-Content -Raw .local/paseo-dev/server-id).Trim()
pnpm exec worknaru status --endpoint ws://127.0.0.1:6868/ws --server-id $serverId --json
```

다른 Daemon을 조회할 때는 주소와 예상 서버 ID를 별도로 확인해 전달한다. CLI가 접속 응답을 보고 예상 ID를 자동 등록하지는 않는다. 수동 테스트를 마치면 `web:dev` 터미널에 `stop`을 입력해 전용 Daemon을 종료한다.

루트의 `pnpm --silent worknaru ...` 또는 `node apps/cli/bin/worknaru.mjs ...`로도 실행할 수 있다. JSON을 파싱하는 Agent는 pnpm의 스크립트 실행 로그가 섞이지 않도록 `pnpm exec worknaru ... --json`이나 직접 Node 실행을 사용한다. 코드 변경 후에는 다시 빌드한다. 현재 workspace 내부에서 실행하며 전역 설치는 필요하지 않다.

전용 Daemon의 시작부터 실제 CLI 조회, 종료까지 확인하려면 `pnpm paseo:verify`를 실행한다. 이 검증이 끝나면 전용 Daemon은 종료되므로, 그 직후 `worknaru status`의 `connection_failed`와 종료 코드 `1`은 예상 결과다. CLI 자체는 Daemon을 시작하거나 종료하지 않는다. [개발 환경 안내](../paseo-dev/README.md)

## 옵션과 환경 변수

값은 `--endpoint <url>`처럼 공백으로 구분한다. 같은 옵션을 중복 지정하거나 알 수 없는 옵션·인자를 전달하면 입력 오류다.

| 옵션 | 환경 변수 | 기본값·의미 |
| --- | --- | --- |
| `--endpoint <url>` | `WORKNARU_ENDPOINT` | 필수. 자격증명·query·fragment가 없는 `ws:` 또는 `wss:` 절대 URL |
| `--server-id <id>` | `WORKNARU_SERVER_ID` | 필수. 확인하려는 Daemon의 서버 ID |
| `--target <id>` | `WORKNARU_TARGET_ID` | `worknaru`. 출력에서 대상을 구분하는 이름 |
| `--timeout-ms <ms>` | `WORKNARU_TIMEOUT_MS` | `5000`. 연결과 상태 조회의 합계 제한 시간, 정수 1~300000ms |
| 없음 | `WORKNARU_PASSWORD` | 인증이 필요한 경우에만 지정. 명령행 옵션으로 받지 않음 |
| `--json` | 없음 | stdout에 JSON 한 문서를 출력 |
| `--help`, `-h` | 없음 | 설정 없이 도움말 출력 |

명령행 옵션이 해당 환경 변수보다 우선한다. `PASEO_*`, 사용자 홈의 Paseo 설정이나 기본 Daemon 주소는 대상 선택에 사용하지 않는다. 비밀번호는 출력에 포함하지 않으며 주소에 넣을 수 없다. 설정 파일과 대상 등록 기능은 아직 없다.

## 출력과 종료 코드

`--json` 상태 조회는 [Runtime의 `DaemonStatus`](../../packages/runtime/README.md)를 한 줄 JSON으로 stdout에 출력하고 stderr는 비워 둔다. `outcome`, `failure.code`, `server`를 함께 확인한다. `connection`은 조회 당시의 관찰값이며 조회용 연결은 명령이 끝날 때 정리된다. `localProcess: unknown`은 접속 결과만으로 운영체제 프로세스 상태를 판단하지 않았다는 뜻이다.

| 종료 코드 | 의미 |
| --- | --- |
| `0` | `outcome: available`, 또는 도움말 출력 |
| `1` | `outcome: unavailable`. 접속 실패, 인증 필요/실패, 시간 초과, ID 불일치 등을 `failure.code`로 구분 |
| `2` | 명령·옵션 오류 또는 설정 누락/오류 |
| `3` | 예상하지 못한 내부 오류 |

입력·설정·내부 오류도 `--json`이 있으면 다음 형태로 stdout에 출력한다. 원래 인자나 내부 예외·스택은 포함하지 않는다.

```json
{"error":{"code":"invalid_arguments","message":"Unknown command. Use worknaru --help."}}
```

오류 코드는 `invalid_arguments`, `invalid_configuration`, `internal_error`다. JSON 옵션이 없으면 상태 결과는 stdout, 입력·설정·내부 오류 설명은 stderr에 출력한다. 도움말은 `--json`과 함께 요청해도 항상 일반 텍스트다.

## 구현 경계와 검증

[시작 코드](src/bootstrap.ts)는 Paseo Adapter를 만들고 Core에 주입한다. [명령 처리](src/cli.ts)는 `@worknaru/core` API만 호출하며 Paseo SDK를 가져오지 않는다. Core는 Runtime 인터페이스에만 의존하고, 구체적인 Paseo 호출·오류 변환은 Adapter에 남는다. [ADR 0001](../../docs/adr/0001-runtime-interface-and-paseo-adapter.md)

`pnpm test`는 빌드, Core를 거친 CLI 호출, 입력·설정·출력·종료 코드, 실제 실행 파일의 동작과 Adapter 오류 처리를 검사한다. `pnpm paseo:verify`는 실제 Daemon에서 CLI 정상 조회·ID 불일치·종료 후 접속 실패와 조회 전후 프로세스·세션 유지를 검사한다.

작업 범위와 검증 근거는 [Issue #4](https://github.com/NaruForge/worknaru-dev/issues/4)에서 관리한다.
