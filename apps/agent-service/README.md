# Agent 실행 서비스

## Module 서비스

[서버 구성](server/module-service.mjs)이 소유권과 ready 마커를 확인하고 Core 실행 정책에 [내장 구현](server/modules.mjs), Workspace 조회와 [Module 저장소](server/module-store.mjs)를 주입한다. 기존 플러그인의 `modules.execute`는 `list`, `execute`, `getRun`, `listRuns`만 받으며 입력은 Core에서 검증한다. Agent/Provider 초기화와 별개로 동작한다. 실패 시 내부 파일 경로나 실행 예외를 RPC로 노출하지 않는다.

`module-runs.sqlite`는 입력·결과·요청 ID·업무 귀속·수명을 저장한다. SQL 유일 제약으로 접수 ID를 중복 방지하고, 조건부 상태 전이·WAL·FULL 동기화를 사용한다. 앱 생성 DDL과 quick_check를 확인하며 알 수 없는 스키마와 DB/부속 파일 링크는 거부한다. 시작 시 미완료 실행을 uncertain으로 기록하고 자동 실행하지 않는다. 정확한 수명은 [ADR 0016](../../docs/adr/0016-module-run-idempotency-and-recovery.md)에 있다.

`pnpm test`는 동시 접수·서로 다른 업무 조회·실행 실패·실제 자식 프로세스 종료·재시작·저장 검증을 포함한다. 실제 CLI/RPC와 Daemon 재시작 검증은 빌드 후 `node --test apps/agent-service/test/modules.integration.mjs`로 실행한다. 외부 실행별 데이터만 사용하고 Provider를 호출하지 않으며 Workspace 실연동과 직렬 실행한다. [#55](https://github.com/NaruForge/worknaru-dev/issues/55)

## Agent 서비스

전용 Paseo Daemon에 로드하는 신뢰된 로컬 서버 플러그인이다. `worknaru-agent-service`의 `agents.execute` RPC로 CLI와 Web의 요청을 받고, Core 정책을 사용해 지속 대기열을 실행한다. UI나 CLI 프로세스의 수명에 의존하지 않는다.

RPC envelope는 Adapter와 이 앱의 통신 구현에 한정한다. `operation`은 Agent 메서드의 고정 enum으로 검증하며 임의 명령이나 서비스 수명 메서드를 실행할 수 없다. Core 정책 서비스도 공개 `execute()` 없이 Agent별 명시적 메서드를 제공한다. Module·Workspace 작업을 이 RPC에 추가하지 않는다.

설치는 저장소 루트에서 `pnpm exec worknaru agent setup` 후 `pnpm exec worknaru dev start`다. setup은 기본 전용 설정을 백업하고 이 앱만 활성화한다. 개인용 Paseo 설정은 사용하지 않는다. 실행 중 setup이나 사용자 변경 설정 덮어쓰기는 거부한다. 자세한 사용법은 [CLI](../cli/README.md)와 [Web](../web/README.md)에 있다.

`index.server.ts`가 RPC를 등록하고 초기화를 시작한다. `server/entry.mjs`는 전용 실행기가 전달한 데이터 루트·소유 checkout·저장 구조 마커와 server-id를 확인한다. [Core 정책](../../packages/core/src/agent-service.mjs)에 [Paseo Driver](../../packages/paseo-adapter/src/agent-driver.mjs), 폴더 검증과 SQLite 저장소를 주입한다. 플러그인 해제 시 타이머·구독·연결·DB를 정리한다. 전용 데이터 경로가 없으면 사용자 홈으로 대체하지 않는다.

`agent-state.sqlite`와 WAL은 선택한 `WORKNARU_DATA_DIR` 아래에 있다. 단일 상태 문서에 전송 기본값/revision, 요청·전송 결과, 대기열 정지 상태, 생성 요청 ID를 저장한다. `synchronous=FULL` 트랜잭션과 revision 비교로 오래된 두 번째 Worker의 덮어쓰기를 거부한다. DB 쓰기 실패 시 새 실행을 멈춘다. Agent 세션·대화·파일의 원본은 Paseo/Provider이며 이를 DB에 복제하지 않는다. SQLite에 저장하는 메시지 내용도 로컬 실행 데이터이므로 공개 웹 자산과 Git에 포함하지 않는다.

전송 방식은 공유 설정에서만 선택하고 새 접수부터 적용한다. 기존 접수의 방식·요청 ID·대기는 재작성하지 않는다.

재시작 시 실행 전 대기는 보존한다. 이미 전송했으나 결과를 확인하지 못한 요청은 `uncertain`으로 멈추고 자동 재전송하지 않는다. 사용자 기록 확인 후 `queue discard`/`queue resume`으로 남은 대기를 처리한다. 보관은 기록과 작업 파일을 남기며 해당 Agent와 하위 Agent의 실행을 정리한다.

`pnpm test`는 Core 정책·SQLite 재열기·중복 Worker 거부·Paseo 기본 전송 계약를 검사한다. 실제 Provider와 브라우저 검증은 별도 실행하며 사용량이 발생한다. Node.js 24의 내장 SQLite를 사용하고 Paseo SDK·서버·플러그인 계약은 0.8.0에 고정한다. 결정 근거는 [ADR 0008](../../docs/adr/0008-native-paseo-send-settings.md), 실제 증거는 [Issue #17](https://github.com/NaruForge/worknaru-dev/issues/17)에 있다.

Agent 생성과 `options({ cwd })`는 명시적인 유효 작업 폴더를 요구한다. 제품 저장소를 기본 작업 폴더로 전달하지 않는다. 서버 경계가 공통 ASCII·절대경로·실제 디렉터리 검증을 주입하며 새 전송·dispatch·재개·실행을 이어가는 권한 승인 직전에도 다시 확인한다. 오류는 Provider 호출과 `sending` 기록 전에 발생한다. 자동 dispatch 오류는 해당 Agent의 대기열만 보류하고 사유를 남긴다. 기존 요청 ID 결과 조회·취소·보관과 정상 Agent 실행은 유지한다.

개발용 전체 초기화는 서버 정지 후 [CLI reset](../cli/README.md#사용자-데이터-전체-초기화)으로 수행한다. SQLite·WAL/SHM·Paseo 세션·전용 인증을 모두 폐기하고 새 setup/start에서 빈 상태와 새 server ID를 만든다. 정상 재시작의 지속성·중복 전송 방지 계약은 유지한다. 저장 구조 변경에 마이그레이션·이전 이력 호환·복구를 추가하지 않는다.

## 개발 데이터 관리 중계

별도의 `development.data` RPC는 `snapshot`·`open`·`preview`·`reset`의 제한된 입력만 받는다. `server/data-management.mjs`는 전용 루트·소유 checkout·관리 실행기 기록·현재 서버 ID를 확인한 뒤 기존 Windows named pipe에 전달한다. 응답에서 제어 채널의 인증 토큰·PID·소유권 envelope를 제외한다. 실제 폴더 열기·정지·삭제·재시작은 CLI 관리 실행기가 수행한다. 제품 Agent API나 Core/Runtime에 파일·프로세스 관리 책임을 추가하지 않는다. [ADR 0012](../../docs/adr/0012-settings-data-management.md)

## Workspace·Project API

같은 플러그인이 별도의 `workspace.execute` RPC를 등록한다. `agents.execute`를 확장하거나 Agent 생성을 요구하지 않는다. `server/workspace-domain.mjs`가 외부 전용 루트의 소유 checkout·`ready` 마커를 검사하고 `server/workspace-store.mjs`의 SQLite 저장소를 [Core Workspace API](../../packages/core/README.md#workspaceproject-최소-도메인)에 주입한다. 초기화는 Agent Driver·server-id·Provider 연결을 기다리지 않으며 플러그인 해제 시 두 서비스의 DB/자원을 각각 정리한다. 플러그인 설치·활성화 자체는 기존 `agent setup` 흐름을 사용한다.

RPC 입력은 `{ operation, input }`이며 아래 여섯 작업과 각 입력의 필드만 허용한다. 성공은 `{ ok: true, data }`, 실패는 `{ ok: false, error: { code, message } }`다. 도메인 오류는 Core의 안전한 코드·메시지를 전달하고 초기화 실패는 `service_error`로 처리한다. 임의 메서드·파일 경로·SQL을 받지 않는다. 현재 UI·CLI에는 이 기능의 화면·명령·클라이언트 연결을 추가하지 않았다.

| operation | input |
| --- | --- |
| `createWorkspace` | `{ name }` |
| `listWorkspaces` | `{}` |
| `getWorkspace` | `{ id }` |
| `createProject` | `{ workspaceId, name }` |
| `listProjects` | `{ workspaceId }` |
| `getProject` | `{ id }` |

저장 파일은 `WORKNARU_AGENT_DATA_ROOT` 아래의 `worknaru-domain.sqlite`다. 별도 경로 환경 변수·기본 Workspace·로컬 작업 폴더를 만들지 않는다. DB·부속 파일의 링크를 거부하고 외래키·행 단위 원자적 insert·WAL·`synchronous=FULL`을 사용한다. 여러 연결은 DB의 현재 행을 조회하며 Agent queue의 상태 스냅샷/revision을 공유하지 않는다. 정상 재시작은 보존하고, 기존 승인된 전용 루트 전체 초기화는 이 DB와 부속 파일도 삭제한다. [저장·보존 범위](../../docs/data-storage.md)

기존 DB는 `user_version=1`만으로 신뢰하지 않는다. 초기화 잠금 안에서 `sqlite_schema`의 앱 소유 객체 전체를 v1 생성 DDL과 대조하고, `quick_check`와 `foreign_key_check`로 기존 행도 검사한 뒤에만 WAL을 설정한다. PK·FK·NOT NULL·CHECK·STRICT·인덱스가 다르거나 예상하지 않은 객체가 있으면 변경 없이 거부한다. 공백 배치를 제외한 앱 생성 DDL만 허용하며, 외부 도구가 재작성한 의미상 동등한 스키마의 호환성까지 제공하지 않는다. 자동 복구·마이그레이션·데이터 삭제는 하지 않는다.

`pnpm test`는 소속·입력 검증, 저장 실패, 별도 프로세스 재시작, 동시 생성, 소유권/초기화 차단 회귀를 포함한다. `workspace-schema.test.mjs`는 수정 전 정상 v1 DB의 호환성과 잘못된 v1 DB의 무변경 거부를 DELETE/WAL 양쪽에서 검사한다. 이 검증은 Provider 호출을 하지 않는다. 변경 범위와 실행 근거는 [Issue #51](https://github.com/NaruForge/worknaru-dev/issues/51)에 둔다.

실제 RPC 연결은 Windows에서 아래 명령으로 별도 검증한다. 먼저 관리형 개발 환경을 정상 종료하고 [검증 데이터 격리](../paseo-dev/README.md#검증-데이터-격리) 규칙을 따른다.

```powershell
pnpm build
node --test apps/agent-service/test/workspace.integration.mjs
```

이 검사는 외부 임시 데이터 루트와 기존 전용 Daemon 실행기를 사용한다. 실제 `workspace.execute`의 여섯 API·오류 응답, 정상 종료 후 새 프로세스의 ID·소속·생성 시각 보존, 잘못된 스키마의 `service_error` 응답과 DB 보존을 확인한다. Agent 생성·Provider 로그인·메시지 전송은 하지 않는다. 고정 포트를 쓰므로 다른 실연동과 동시에 실행하지 않는다. Windows CI의 `tests` 작업이 전체 `pnpm test` 이후 이 검사를 직렬 실행하며, 일반 패키지 단위 테스트에는 포함하지 않는다. Linux의 명시적 skip은 실연동 성공 근거가 아니다.
## Agent 업무 컨텍스트

앱은 Workspace 도메인을 준비한 뒤 공통 Core Resolver를 Agent 서비스에 주입한다. target이 없는 이전 API 호출은 standalone으로 수용하며 잘못된 target은 메시지 접수·Driver 전송 전에 거부한다. 저장된 요청의 context는 불변 snapshot이고 요청 ID 재확인·대기열 dispatch·재시작에서 그대로 사용한다. Agent 상태 문서는 버전 2이며 기존 루트의 자동 초기화/변환은 하지 않는다.

`pnpm agent:verify`는 전용 외부 데이터·작업 폴더에서 실제 Codex 대화와 세 업무 대상, 없는 대상 거부, 대상 변경 재시도 충돌, 정상 재시작 후 snapshot 보존, 기존 queue/archive를 확인한다. Provider 설치·로그인·사용량이 필요하다. 단위 검사는 Provider 없이 잘못된 대상의 전송 0회, caller/반환 객체 변조 방지와 저장된 snapshot 사용을 검증한다.
