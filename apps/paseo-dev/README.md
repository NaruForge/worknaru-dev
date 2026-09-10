# Paseo 개발 환경 검증

Worknaru 전용 Daemon의 시작·SDK 연결·상태 조회·종료와 [Paseo Adapter](../../packages/paseo-adapter/README.md)의 연동을 검증하는 개발용 프로그램이다. 제품용 Worknaru CLI는 별도 구현 대상이다. 환경 구성의 근거는 [Issue #1](https://github.com/NaruForge/worknaru-dev/issues/1), 상태 조회 구현의 근거는 [Issue #2](https://github.com/NaruForge/worknaru-dev/issues/2)에서 관리한다.

## 실행

저장소 루트에서 실행한다. 검증 환경은 Windows, Node.js `24.18.0`, 루트 `packageManager`의 pnpm이다.

```powershell
pnpm install --frozen-lockfile --store-dir .pnpm-store
pnpm paseo:verify
```

`paseo:verify`는 필요한 패키지를 빌드하고 전용 Daemon을 시작해 검증한 뒤 종료한다. 이미 설정된 전용 대상에 상태 조회만 하려면 `pnpm paseo:status`를 실행한다. 이 명령은 Daemon을 자동 시작하지 않는다. `outcome: available`이면 종료 코드 0, 조회 실패나 설정 누락이면 1을 반환한다. 따라서 검증 종료 직후에는 `connection_failed`가 예상 결과다.

CLI·SDK·Daemon은 `0.8.0-beta.1`로 고정했다. 현재 PC에서 조사한 Paseo와 버전을 맞춘 개발 검증용 선택이며, 이후 버전 변경 시 이 검증을 다시 수행한다. 프로젝트의 npm 패키지를 사용하므로 개인용 Paseo Desktop 설치나 전역 `paseo` 명령이 필요하지 않다. `esbuild`와 `node-pty`의 설치 스크립트는 pnpm workspace 설정에서 허용한다.

## 동작과 운영 분리

| 항목 | 값·동작 |
| --- | --- |
| Daemon 데이터 | 저장소 루트의 `.local/paseo-dev/` |
| SDK 접속 주소 | `ws://127.0.0.1:6868/ws` |
| 실행 파일 | 고정된 `@getpaseo/server`의 supervisor 진입점 |
| 설정·로그·worktree·임시 파일 | 전용 데이터 디렉터리 아래 |
| 사용자 홈·인증 | 기존 Windows 사용자 홈과 Provider 인증 환경을 사용 가능 |
| 상속 환경 | 호출자의 `PASEO_*`, `ELECTRON_*`를 제거한 자식 환경에 전용 대상 설정을 전달 |
| 이번 검증에서 끄는 기능 | 릴레이, MCP 주입·도구 호출, 브라우저 도구, 추가 서비스 프록시 리스너, 웹 UI, 음성, 플러그인 |
| 검증 종료 | 전용 Daemon 종료, 리스너 폐쇄·PID 파일 제거 확인 |

1. 포트와 전용 PID 파일을 확인하고 설정을 준비한다. 기존 설정이 예상값과 다르면 덮어쓰지 않고 실패한다.
2. 전용 supervisor를 숨겨진 자식 프로세스로 시작한다. Agent를 만들거나 AI 요청을 보내지 않는다.
3. SDK handshake의 서버 ID를 전용 `server-id` 파일과 비교하고, PID 파일이 이번에 시작한 프로세스를 가리키는지 확인한다.
4. 서버 버전·릴레이 상태와 빈 Agent 목록을 조회한다. 클라이언트를 닫고 다시 연결해 같은 Daemon이 유지되는지도 확인한다.
5. Adapter로 상태 조회와 서버 ID 불일치 처리를 확인하고, Daemon의 PID·시작 시각과 빈 Agent 목록이 유지되는지 확인한다.
6. 검증 프로그램이 확인한 연결로 Daemon 종료를 요청한다. 프로세스 종료와 리스너·PID 잠금 정리를 확인하고, Adapter가 종료 후 접속 실패를 반환하는지 확인한 뒤 JSON 결과를 출력한다.

실패하면 종료 코드 `1`을 반환한다. 시작한 프로세스가 남아 있으면 이번 실행이 생성한 프로세스 트리만 정리한다. 데이터와 로그는 진단을 위해 남긴다. `.local/`과 프로젝트 의존성·pnpm store는 Git 추적에서 제외한다.

## 실패 시 확인

- 포트가 사용 중이면 실행을 거부한다. 해당 포트의 프로그램을 자동 종료하거나 다른 Paseo로 접속하지 않는다.
- `.local/paseo-dev/paseo.pid`가 있으면 먼저 실제 프로세스와 로그를 확인한다. 살아 있는 Daemon이나 소유권이 불명확한 PID를 자동 정리하지 않는다.
- 시작 제한 시간은 45초이며, 개별 접속·조회는 5초, 정상 종료 대기는 20초다. 원인은 `.local/paseo-dev/daemon.log`와 `launcher.log`에서 확인한다.
- 이전 설정이 남아 충돌하면 `config.json`을 확인한다. 사용자 홈의 `.paseo`를 변경할 필요는 없다.

## SDK 연동에서 확인한 경계

공개 `createPaseoApi(driver).agents.list()`로 세션 목록을 조회한다. 이 버전의 공개 `createPaseoClient()`는 서버 식별 정보·Daemon 상태·종료 API를 제공하지 않아 검증 코드에서 `@getpaseo/client/internal/daemon-client`의 `getLastServerInfoMessage()`, `getDaemonStatus()`, `shutdownServer()`를 사용한다. 서버 패키지의 supervisor 파일 경로도 내부 진입점이다. 이 내부 의존성들은 버전 변경 시 재확인이 필요하다.

제품 Adapter에는 [초기 설계](../../docs/paseo-adapter-initial-design.md)와 [ADR 0001](../../docs/adr/0001-runtime-interface-and-paseo-adapter.md)의 의존 경계를 적용한다. Daemon 생성·종료와 원시 SDK 비교 조회는 검증 프로그램의 역할이며, Adapter는 조회용 클라이언트만 생성·정리한다. Agent 생성, 작업 중단, 권한 요청과 실제 Provider 인증은 별도 검증 대상이다.

기존 개인용 Paseo의 비교 확인은 이 프로그램의 접속 대상에 포함하지 않는다. 함께 실행 중인 Paseo가 있다면 읽기 전용 상태 조회로 검증 전후의 서버 ID·PID·시작 시각·접속 주소와 응답 상태를 비교한다. 개인용 식별 정보와 로컬 로그는 공개 Issue에 올리지 않는다.
