# Agent 실행 서비스

전용 Paseo Daemon에 로드하는 신뢰된 로컬 서버 플러그인이다. `worknaru-agent-service`의 `agents.execute` RPC로 CLI와 Web의 요청을 받고, Core 정책을 사용해 지속 대기열을 실행한다. UI나 CLI 프로세스의 수명에 의존하지 않는다.

설치는 저장소 루트에서 `pnpm exec worknaru agent setup` 후 `pnpm exec worknaru dev start`다. setup은 기본 전용 설정을 백업하고 이 앱만 활성화한다. 개인용 Paseo 설정은 사용하지 않는다. 실행 중 setup이나 사용자 변경 설정 덮어쓰기는 거부한다. 자세한 사용법은 [CLI](../cli/README.md)와 [Web](../web/README.md)에 있다.

`index.server.ts`가 RPC를 등록하고 초기화를 시작한다. `server/entry.mjs`는 전용 실행기가 전달한 데이터 루트·기본 작업 폴더와 server-id를 확인한다. [Core 정책](../../packages/core/src/agent-service.mjs)에 [Paseo Driver](../../packages/paseo-adapter/src/agent-driver.mjs), 폴더 검증과 SQLite 저장소를 주입한다. 플러그인 해제 시 타이머·구독·연결·DB를 정리한다. 전용 데이터 경로가 없으면 사용자 홈으로 대체하지 않는다.

`agent-state.sqlite`와 WAL은 선택한 `WORKNARU_DATA_DIR` 아래에 있다. 단일 상태 문서에 전송 기본값/revision, 요청·전송 결과, 대기열 정지 상태, 생성 요청 ID를 저장한다. `synchronous=FULL` 트랜잭션과 revision 비교로 오래된 두 번째 Worker의 덮어쓰기를 거부한다. DB 쓰기 실패 시 새 실행을 멈춘다. Agent 세션·대화·파일의 원본은 Paseo/Provider이며 이를 DB에 복제하지 않는다. SQLite에 저장하는 메시지 내용도 로컬 실행 데이터이므로 공개 웹 자산과 Git에 포함하지 않는다.

재시작 시 실행 전 대기는 보존한다. 이미 전송했으나 결과를 확인하지 못한 요청은 `uncertain`으로 멈추고 자동 재전송하지 않는다. 사용자 기록 확인 후 `queue discard`/`queue resume`으로 남은 대기를 처리한다. 보관은 기록과 작업 파일을 남기며 해당 Agent와 하위 Agent의 실행을 정리한다.

`pnpm test`는 Core 정책·SQLite 재열기·중복 Worker 거부·실제 설치된 전송 guard를 검사한다. 실제 Provider와 브라우저 검증은 별도 실행하며 사용량이 발생한다. Node.js 24의 내장 SQLite를 사용하고 Paseo SDK·서버·플러그인 계약은 0.8.0에 고정한다. 결정 근거는 [ADR 0006](../../docs/adr/0006-agent-lifecycle-and-durable-queue.md), 실제 증거는 [Issue #17](https://github.com/NaruForge/worknaru-dev/issues/17)에 있다.
