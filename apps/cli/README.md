# Worknaru CLI

개발 환경 관리와 Codex Agent의 생성·대화·대기열·보관을 제공한다. 사람은 이름과 대화형 입력으로 사용할 수 있고, 자동화는 ID와 JSON 출력을 사용할 수 있다. 제품 기능은 Core API를 호출한다.

## 설치와 기본 사용

저장소 루트에서 실행한다. 관리형 개발 환경은 Windows와 Node.js 24 LTS, 루트 `packageManager`에 지정된 pnpm을 지원한다. 실제 검증 버전은 Node.js `24.18.0`이다.

```powershell
pnpm install --frozen-lockfile
pnpm exec worknaru doctor
pnpm exec worknaru dev start
pnpm exec worknaru status
pnpm exec worknaru dev stop
```

`dev start`가 준비 완료 후 터미널을 반환하면 같은 PC에서 `http://127.0.0.1:6868/`를 연다. 터미널을 닫아도 실행은 유지된다. 전역 설치·PATH 변경은 필요하지 않다. 일반 셸의 `worknaru`만으로 실행할 수 있다는 전제는 두지 않는다.

| 명령 | 동작 |
| --- | --- |
| `doctor` | Node·pnpm·의존성·빌드·데이터 경로·기존 설정·잠금·관리 인스턴스를 점검하고 해결 방법을 안내한다. 빌드·설치·자동 수정·파일 생성·쓰기 시험·프로세스 제어는 하지 않는다. |
| `dev start` | 정지 상태에서는 빌드 후 전용 Daemon과 Web UI를 백그라운드로 실행한다. 소유권·서버 ID·Core 상태 응답·웹 파일·접속 설정 확인 뒤 성공한다. 정상 실행 중이면 빌드나 재시작 없이 재사용한다. |
| `status` | 현재 저장 루트의 관리 실행기를 확인하고 Core를 통해 상태를 조회한다. 미실행·작업 중·조회 불가·소유권 충돌을 구분한다. 빌드·시작·복구는 하지 않는다. |
| `dev stop` | 소유권을 확인한 실행기에 정상 종료를 요청하고 종료 결과를 확인한다. 이미 정지했다면 성공한다. |

새 코드·브랜드를 반영하려면 `dev stop` 후 `dev start`한다. 빌드 존재 여부와 최신 여부는 다르므로, `doctor`의 빌드 점검은 파일 존재만 확인한다. 디렉터리 쓰기 가능 여부는 `dev start`에서 실제 쓰기로 검사한다.

진입점은 빌드 전에도 동작한다. 의존성 설치에 문제가 있어 `pnpm exec`가 실행되지 않으면 `node apps/cli/bin/worknaru.mjs doctor`로 진단한다. Node 자체가 없으면 먼저 설치해야 한다. 빌드 전 도움말에는 기본 이름 Worknaru를 표시하고 빌드 후에는 [공통 브랜드](../../packages/branding/README.md)의 이름을 사용한다.

## Agent 생성부터 보관까지

Codex 설치·로그인을 준비한 뒤 정지된 개발 환경에서 `pnpm exec worknaru agent setup`을 한 번 실행한다. 기존 기본 설정은 데이터 루트의 `config.before-agents-<시각>.json`에 백업하고 전용 실행 플러그인을 등록한다. 변경된 사용자 설정은 덮어쓰지 않으며 실행 중인 환경에서는 거부한다. 다음 `dev start`가 플러그인 준비까지 확인한다. 이미 준비된 설정에서 setup은 재사용한다.

```powershell
pnpm exec worknaru agent setup
pnpm exec worknaru dev start
pnpm exec worknaru agent create --name "문서 도우미"
pnpm exec worknaru agent list
pnpm exec worknaru agent show "문서 도우미"
pnpm exec worknaru agent send "문서 도우미" "이 폴더의 문서 구성을 설명해 주세요."
pnpm exec worknaru agent send "문서 도우미" "그 설명을 세 문장으로 줄여 주세요."
pnpm exec worknaru agent history "문서 도우미" --all
pnpm exec worknaru agent archive "문서 도우미"
pnpm exec worknaru agent list --archived
```

대화형 `create`는 작업 폴더·실제 사용 가능한 Codex 모델·이름을 묻는다. `--cwd`, `--model`, `--name`으로 생략할 수 있다. 비대화형에서는 현재 폴더·Provider의 기본 모델·`새 Agent`를 사용한다. 같은 폴더에서 서로 독립적인 Agent를 만들 수 있다. 모든 폴더 경로는 Daemon 컴퓨터 기준이다. 이름이 겹치면 전체 ID 또는 유일한 4자 이상 ID 접두사를 쓴다. 목록에는 이 제품에서 만든 Agent만 표시한다.

`send`는 접수 후 기본 600초 동안 결과를 관찰한다. `--no-wait`는 접수 상태와 요청 ID를 바로 반환한다. `wait <agent> --request <요청ID>`로 다시 관찰할 수 있다. `--wait-timeout 60`은 관찰 시간만 제한한다. Ctrl+C도 관찰만 끝내며 Agent 작업을 중단하지 않는다. 후속 `send`는 같은 Agent 세션의 대화를 이어간다. `history`는 최근 최대 200개 원본 항목을 읽고, `--all`은 이전 페이지도 읽는다. `send`/`wait`의 완료 응답은 필요하면 이전 페이지까지 읽어 해당 요청의 응답을 표시한다. 조회 도중 기록이 교체돼 응답 범위를 확인하지 못하면 전체 기록 조회를 안내한다. 응답 조각은 사람용 출력에서 하나로 합친다.

### 전송 방식과 대기열

```powershell
pnpm exec worknaru settings get send-mode
pnpm exec worknaru settings set send-mode queue
pnpm exec worknaru agent send "문서 도우미" "다음 작업" --queue --no-wait
pnpm exec worknaru agent send "문서 도우미" "현재 작업의 조건을 추가합니다" --steer --no-wait
pnpm exec worknaru agent queue list "문서 도우미"
pnpm exec worknaru agent queue cancel "문서 도우미" <대기요청ID>
pnpm exec worknaru agent queue resume "문서 도우미"
```

기본 `queue`는 현재 작업이 성공한 뒤 FIFO로 실행한다. CLI와 Web의 기본 설정은 같은 저장소에 기록되며 `--queue`/`--steer`는 이번 메시지에만 적용된다. `steer`는 진행 중인 턴에 추가 지시를 전달한다. 실행 중이 아니면 새 턴으로 처리한다. 권한 대기·앞선 대기 메시지·일시 정지 상태에서는 추가 지시를 거부한다. Provider가 지원하지 않거나 턴이 바뀌면 실패를 알리고, 진행 중인 작업을 중단하는 방식으로 바꾸지 않는다.

대기 메시지는 데이터 루트의 SQLite에 저장된다. 터미널·브라우저 종료와 무관하게 실행하고 Daemon 재시작 뒤에도 보존한다. 실패·취소 시 다음 메시지를 자동 실행하지 않는다. 기록을 확인한 후 `queue resume`으로 남은 메시지만 재개한다. `queue cancel`은 실행 전 메시지만 취소한다.

접수 도중 연결이 끊기거나 재시작 전 실행 결과를 확정할 수 없으면 `uncertain`으로 남기고 자동 재전송하지 않는다. 기록·파일·현재 작업 상태를 확인한 뒤 `agent queue discard <agent> <요청ID> --yes`로 해당 요청의 자동 재실행을 포기하고, `queue resume`을 실행한다. 완료로 표시하는 기능은 아니며 진행 중인 작업·권한 요청이 있으면 거부한다. 필요하면 별도의 새 요청 ID로 새 메시지를 보낸다.

### 권한과 보관

대화형 `send`/`wait`는 권한 요청을 표시하고 승인·거부를 묻는다. 질문은 선택지 번호나 직접 입력으로 답한다. 비대화형과 `--json`은 질문하지 않고 `permission_pending`과 요청 정보를 반환한다.

`agent permissions`는 권한 ID, 실행 입력과 선택 가능한 action을 표시한다. 특정 선택지를 지정할 때는 표시된 `--allow`/`--deny`와 `--action <actionID>`를 함께 사용한다.

```powershell
pnpm exec worknaru agent permissions "문서 도우미"
pnpm exec worknaru agent permission respond "문서 도우미" <권한ID> --allow
pnpm exec worknaru agent permission respond "문서 도우미" <권한ID> --deny
# 질문의 header를 키로 전달한다. 여러 선택은 쉼표로 구분한다.
pnpm exec worknaru agent permission respond "문서 도우미" <권한ID> --allow --answers '{"answers":{"선택":"첫 번째"}}'
```

Provider가 명시적 action을 제공하면 `--action <ID>`를 함께 쓴다. 이미 처리된 요청은 다시 처리하지 않는다. 승인·거부를 기본값으로 자동 제출하지 않는다.

`archive`는 대상·하위 Agent·진행 중인 작업·취소할 대기열을 먼저 보여 준다. 확인 후 작업을 중단하고 보관한다. 비대화형에서는 확인 필요 결과와 미리보기를 반환하며, 검토 후 `--yes`를 붙여 실행한다. 확인 사이에 영향 범위가 바뀌면 다시 확인해야 한다. 일부 보관 실패는 성공과 구분해 보고한다. 보관된 Agent는 이력만 조회하며 메시지 전송으로 자동 복구하지 않는다. 대화 기록·작업 폴더 파일은 남고 영구 삭제·복원은 지원하지 않는다.

### 자동화 결과

생성·전송에 `--id <고유요청ID>`를 지정하면 같은 내용의 재시도를 한 번의 요청으로 묶는다. 같은 ID로 내용을 바꾸면 `id_conflict`다. 생성·전송 응답을 받지 못한 자동화는 **새 ID로 재전송하지 말고 같은 ID로 조회·재시도**한다.

전송 결과는 `id`, `agentId`, `text`, `mode`, `state`, `turnId`, `createdAt`, `error`를 포함한다. 상태는 `queued`, `sending`, `running`, `completed`, `failed`, `canceled`, `uncertain`이다. 접수 성공은 작업 완료와 다르다. 종료 코드는 성공 0, 실패·권한 대기·관찰 시간 초과·확인 필요 1, 입력 오류 2, Ctrl+C 관찰 종료 130이다. 전송과 권한 RPC는 SDK 응답 제한도 적용되며 `--timeout-ms`는 Agent 연결 대기에 적용된다. 실행 완료 대기는 `--wait-timeout`으로 제어한다.

기능 설계·검증 근거: [ADR 0006](../../docs/adr/0006-agent-lifecycle-and-durable-queue.md), [Issue #17](https://github.com/NaruForge/worknaru-dev/issues/17).

## 대상 선택

기본 대상은 `WORKNARU_DATA_DIR`로 정한 저장 루트이며 미설정 시 이 CLI가 속한 저장소의 `.local/paseo-dev/`다. 다른 터미널에서도 같은 사용자 지정 루트를 쓰려면 같은 변수를 설정한다. 폴더명은 기본 경로까지 영문·숫자·`-_.`만 허용한다. [저장 위치 설정](../paseo-dev/README.md#저장-위치-설정)

명시적인 접속 옵션 또는 아래 연결 환경 변수 중 하나라도 있으면 기존 명시적 조회 모드를 사용한다. 빈 값도 명시한 설정으로 취급한다. 주소와 예상 서버 ID를 모두 제공해야 하며, 누락한 값을 로컬 환경에서 보충하지 않는다.

```powershell
pnpm exec worknaru status --endpoint ws://127.0.0.1:6868/ws --server-id <확인한-서버-ID> --json
```

| 옵션 | 환경 변수 | 의미 |
| --- | --- | --- |
| `--endpoint <url>` | `WORKNARU_ENDPOINT` | 자격증명·query·fragment 없는 `ws:` 또는 `wss:` 절대 URL |
| `--server-id <id>` | `WORKNARU_SERVER_ID` | 예상 서버 ID |
| `--target <id>` | `WORKNARU_TARGET_ID` | 대상 표시 ID, 기본 `worknaru` |
| `--timeout-ms <ms>` | `WORKNARU_TIMEOUT_MS` | 전체 조회 제한 시간. 기본 5000, 정수 1~300000ms |
| 없음 | `WORKNARU_PASSWORD` | 인증이 필요한 경우만 설정. 출력·명령행 비밀번호 옵션 없음 |

옵션이 해당 환경 변수보다 우선한다. 같은 옵션 중복·알 수 없는 옵션·누락 값은 오류다. `PASEO_*`나 개인용 Paseo 설정으로 대체 접속하지 않는다. 개발 명령 `dev start/stop`은 위 연결 환경 변수가 있으면 오류로 알리므로 해제한 후 사용한다. `doctor`는 현재 데이터 루트의 로컬 개발 환경을 점검한다.

모든 명령에 `--json`, `--help`/`-h`를 사용할 수 있다. 명시적 상태 조회는 빌드가 필요하며 미설치·미빌드 시 설치와 `pnpm build`를 안내한다.

## 출력과 종료 코드

`--json`은 stdout에 한 줄 JSON 한 문서를 출력하고 stderr를 비워 둔다. 도움말은 JSON 옵션과 함께 요청해도 일반 텍스트다.

- 명시적 상태 조회: 기존 [Runtime DaemonStatus](../../packages/runtime/README.md) 구조를 유지한다.
- 기본 상태·개발 명령: `kind: "development"`, `state`, `dataRoot`, 다음 명령 `next`를 제공한다. 조회에 성공하면 `daemon` 안에 Core의 DaemonStatus가 담긴다. 웹 주소는 `webUrl`, 재사용은 `reused: true`다.
- 진단: `kind: "doctor"`, 전체 `ok`, `dataRoot`, 개별 `checks`를 제공한다.
- 명령 실패: `{"error":{"code":"...","message":"..."}}` 형식이다. 원시 예외·스택·입력 비밀번호를 출력하지 않는다.

개발 상태는 `running`, `stopped`, `busy`, `starting`, `stopping`, `unavailable`이다. 손상·교체된 기록, 응답 없는 제어 채널과 다른 프로세스의 포트 점유는 성공 상태로 표시하지 않고 오류를 반환한다. `daemon.localProcess`는 기존 계약대로 `unknown`이다. 관리 실행기 관찰을 Runtime의 원격 프로세스 판정으로 바꾸지 않는다.

| 코드 | 의미 |
| --- | --- |
| 0 | 정상 조회·진단·시작·종료·도움말. 이미 정지한 환경의 stop 포함 |
| 1 | 미실행/조회 불가, 진단 문제, 빌드·시작·종료·충돌 등 작업 실패 |
| 2 | 잘못된 명령·옵션·설정 |
| 3 | 예상하지 못한 내부 오류 |

기존 명시적 조회의 오류 코드는 `invalid_arguments`, `invalid_configuration`, `internal_error`다. 로컬 관리에서는 `build_required`, `build_failed`, `prerequisite_failed`, `path_unwritable`, `operation_busy`, `configuration_conflict`, `ownership_conflict`, `controller_unavailable`, `startup_failed`, `startup_timeout`, `shutdown_failed`, `unsupported_platform` 등을 구분한다. 사람용 출력은 상태를 stdout에, 진행·오류를 stderr에 쓴다.

## 실패 시 확인과 지원 범위

먼저 `pnpm exec worknaru doctor`를 실행한다. `build.log`는 마지막 빌드, `dev-runner.log`는 관리 실행기, `launcher.log`와 `daemon.log`는 Daemon 시작·실행 로그다. 모두 선택한 데이터 루트에 있다. 로그 원문에는 로컬 정보가 있을 수 있으므로 공개 이슈에는 필요한 진단만 정리한다.

`dev-operation.lock`은 데이터 루트의 시작·종료 동시 작업을 막고, 저장소의 `.local/dev-build.lock`은 같은 소스의 동시 빌드를 막는다. 실행이 끝나면 자신이 만든 잠금만 지운다. `dev-instance.json`과 임의 토큰을 가진 Windows named pipe로 관리 실행기의 소유권을 확인한다. 저장된 PID만으로 다른 프로세스를 종료하지 않는다.

중단된 명령의 잠금이나 응답 없는 실행 기록은 자동 삭제하지 않는다. 원래 작업·실행기·자식 프로세스가 종료됐는지 먼저 확인하고, 해당 로그와 기록을 검토한 뒤 남은 잠금·실행 기록·PID 파일을 수동 정리한다. 프로세스가 살아 있거나 소유권을 확정할 수 없으면 파일을 제거하지 않는다. 기존 `web:dev`는 원래 터미널에서 종료한다.

빌드는 최대 180초이며 시간 초과 후 자식 종료 확인에 10초를 더 기다린다. 종료를 확인하지 못하면 `operation_cleanup_failed`로 알리고 잠금을 보존한다. 관리 실행기 준비 대기는 90초, Daemon 준비는 45초, 상태 조회는 5초다. 정상 Daemon 종료 대기는 20초이며 CLI의 전체 종료 응답 대기는 40초다. 시작 제한 시간이 지나면 취소를 요청하고 진단을 안내한다. 이번 실행이 만든 자식의 실패 정리만 허용하며 설정·서버 ID·인증 자료는 보존한다.

단일 Windows 로컬 환경·고정 포트 6868을 지원한다. Docker·OS 서비스·부팅 자동 시작·전역 배포·다중 인스턴스·포트 자동 선택·hot reload·새 자동 재시작 정책·자동 설치·데이터 이전·doctor 자동 복구는 지원하지 않는다. 개인용 Paseo, `web:dev`, `paseo:verify`가 점유한 포트를 인수하지 않는다.

## 구현과 검증

[경량 진입점](entry.mjs)이 로컬 환경 관리와 제품 조회를 분기한다. [로컬 환경 관리](local.mjs)와 [백그라운드 실행기](dev-runner.mjs)는 [공통 개발 라이브러리](../../packages/dev-environment/README.md)를 사용한다. 제품 상태 조회는 기존 [시작 코드](src/bootstrap.ts)와 [명령 처리](src/cli.ts)를 통해 Core → Runtime → Adapter를 유지한다. [ADR 0005](../../docs/adr/0005-local-development-cli-boundary.md)

`pnpm test`는 명령·출력·대상 선택·읽기 전용 진단·잠금·손상 기록과 기존 제품 계약을 검사한다. `pnpm dev:verify`는 Windows에서 별도 소스 복사본과 데이터 루트를 만들고 실제 Daemon으로 최초 빌드·셸 종료 후 유지·동시 명령·충돌·실패 정리·ID 보존을 확인한다. 검증 전에 개발 환경을 종료한다. 최초 설치로 캐시에 받은 의존성을 offline 설치해 사용하며 검증 자료는 `.local/` 안에 둔다. `pnpm paseo:verify`는 SDK·Adapter·명시적 CLI 조회를 기존 방식으로 검증한다.

작업 범위와 검증 증거는 [Issue #15](https://github.com/NaruForge/worknaru-dev/issues/15)에 둔다.
