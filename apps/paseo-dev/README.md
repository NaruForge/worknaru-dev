# Paseo 개발 환경 검증

Worknaru 전용 Daemon의 시작·SDK 연결·상태 조회·종료와 [Paseo Adapter](../../packages/paseo-adapter/README.md), [Worknaru CLI](../cli/README.md)의 연동을 검증하는 개발용 프로그램이다. 환경 구성의 근거는 [Issue #1](https://github.com/NaruForge/worknaru-dev/issues/1), Adapter 상태 조회는 [Issue #2](https://github.com/NaruForge/worknaru-dev/issues/2), Core·CLI 연결은 [Issue #4](https://github.com/NaruForge/worknaru-dev/issues/4)에서 관리한다.

## 실행

일상 개발은 [CLI](../cli/README.md)의 `pnpm exec worknaru doctor`, `dev start`, `status`, `dev stop`을 사용한다. 아래 명령은 SDK·Adapter·명시적 CLI의 저수준 연동 검증용이며, 실행 전에 관리형 개발 환경을 `dev stop`으로 종료한다. 새 관리 명령의 실제 검증은 `pnpm dev:verify`다.

저장소 루트에서 실행한다. 검증 환경은 Windows, Node.js `24.18.0`, 루트 `packageManager`의 pnpm이다.

```powershell
pnpm install --frozen-lockfile --store-dir .pnpm-store
pnpm paseo:verify
```

`paseo:verify`는 필요한 패키지를 빌드하고 전용 Daemon을 시작해 검증한 뒤 종료한다. 이미 설정된 전용 대상에 상태 조회만 하려면 `pnpm paseo:status`를 실행한다. 이 명령은 Daemon을 자동 시작하지 않는다. 검증은 독립 임시 루트를 사용하므로 검증 루트를 조회하려면 출력된 경로를 명시한다. `outcome: available`이면 종료 코드 0, 조회 실패나 설정 누락이면 1을 반환한다. 따라서 검증 종료 직후에는 `connection_failed`가 예상 결과다.

CLI·SDK·Daemon은 정식 버전 `0.8.0`으로 고정했다. 베타에서 정식 버전으로 전환한 근거와 연동 검증은 [Issue #11](https://github.com/NaruForge/worknaru-dev/issues/11)에 둔다. 이후 버전 변경 시 이 검증을 다시 수행한다. 프로젝트의 npm 패키지를 사용하므로 개인용 Paseo Desktop 설치나 전역 `paseo` 명령이 필요하지 않다. `esbuild`와 `node-pty`의 설치 스크립트는 pnpm workspace 설정에서 허용한다.

## Web UI 수동 테스트

표시 이름과 웹 자산은 [리브랜딩 설정](../../packages/branding/README.md)을 빌드해 적용한다. 저장 루트와 서버 식별자는 브랜드와 독립적이다.

루트에서 `pnpm web:dev`를 실행하면 웹 앱까지 빌드하고 전용 Daemon을 계속 실행한다. 출력된 `http://127.0.0.1:6868/`를 같은 PC의 브라우저에서 열어 상태를 조회한다. 터미널에 `stop`을 입력하고 Enter를 누르거나 Ctrl+C를 누르면 이번 실행이 시작한 전용 Daemon을 종료한다. 상세 확인 순서는 [Web UI 안내](../web/README.md)를 따른다.

[공통 실행 코드](../../packages/dev-environment/daemon.mjs)는 검증과 웹 실행에서 같은 버전·설정·포트·소유권 확인을 사용한다. [웹 실행 코드](web.mjs)는 웹 UI 활성화와 `PASEO_WEB_UI_DIST_DIR`를 자식 프로세스에만 전달한다. 기존 `config.json`의 웹 UI 비활성 설정은 보존한다. [웹 파일 준비](../../packages/dev-environment/web-files.mjs)는 데이터 루트의 `tmp/web-*`에 허용된 공개 빌드 자산만 복사한다. 접속 대상과 예상 서버 ID는 소유권 확인 후 이 폴더의 `connection.json`에 기록한다. 인증 값·Daemon 설정·로그는 제공하지 않고, 임시 웹 폴더는 해당 실행 종료 시 정리한다.

`dev start`, `web:dev`, `paseo:verify`는 같은 포트를 사용하므로 데이터 루트가 달라도 동시에 실행하지 않는다. 웹 테스트를 마치고 전용 Daemon이 종료된 뒤 기존 검증을 실행한다.

Agent 기능은 `pnpm exec worknaru agent setup` 후 관리형 `dev start`로 실행한다. 사용법은 [CLI](../cli/README.md), [Web](../web/README.md), 지속 실행 구조는 [Agent 서비스](../agent-service/README.md)에 있다. setup을 실행한 루트에서는 플러그인을 활성화하며 기본 저수준 상태 검증과 구분한다. 개인용 Paseo의 플러그인 설정을 바꾸지 않는다.

`pnpm agent:verify`는 개발 환경을 종료한 뒤 실행하는 별도 실제 Codex 검사다. 아래 검증 데이터 격리 규칙에 따라 새 데이터·작업 폴더를 만들고 생성·FIFO·후속 대화·권한 승인 확인·설정/이력 재시작 유지·보관·보관 후 전송 거부를 검증한다. Codex 설치·로그인과 Provider 사용량이 필요하다. 테스트 폴더는 로컬 검증 자료로 남긴다. 권한 거부·질문 답변·공유 설정·하위 보관은 공통 정책 테스트에서도 검사한다. 원본 Paseo steer의 수락·교체와 제거한 전송 모드의 거부는 설치된 기본 계약 테스트로 확인한다. 실제 검증 증거는 [Issue #17](https://github.com/NaruForge/worknaru-dev/issues/17)에 둔다.

## 저장 위치 설정

데이터별 경로·폴더 구조·보존 범위는 [데이터 저장 위치](../../docs/data-storage.md)에 모아 설명한다. 이 절은 저장 루트 입력 규칙과 실행 절차를 다룬다.

`WORKNARU_DATA_DIR`로 외부 루트 하나를 지정한다. 미설정 시 Windows의 `%LOCALAPPDATA%\Worknaru-Dev`를 사용한다. CLI·실행기·Agent 서비스는 [공통 경로 해석](../../packages/dev-environment/paths.mjs)을 사용한다. 실행 시작 시 적용 루트와 출처를 stderr에 출력하며 조회 JSON은 stdout에 둔다.

```powershell
$env:WORKNARU_DATA_DIR = 'C:\WorknaruData\Dev'
pnpm exec worknaru doctor
pnpm exec worknaru agent setup
pnpm exec worknaru dev start
pnpm exec worknaru status
pnpm exec worknaru dev stop
Remove-Item Env:WORKNARU_DATA_DIR
```

경로는 공백 없는 완전한 절대경로여야 하며 폴더명에는 영문 `A-Z a-z`, 숫자 `0-9`, `-_.`만 허용한다. 원문·정규화 결과·실제 대상과 기존 부모 경로를 검사한다. 한글·공백·Windows 예약 이름·끝의 점·지원하지 않는 문자와 junction을 통한 우회는 거부한다. 데이터 루트는 제품 저장소와 동일하거나 서로 포함할 수 없다. 실행할 제품 checkout과 Agent 작업 폴더에도 같은 문자 규칙을 적용한다. 표시 이름이나 대화의 한글·공백 지원과는 별개의 제한이다.

`LOCALAPPDATA` 상위에 한글·공백이 있으면 기본값을 사용하지 않고 명시적 `WORKNARU_DATA_DIR`를 안내한다. 잘못된 override는 다른 경로로 대체하지 않는다. `doctor/status/reset --dry-run`은 디렉터리나 설정을 생성하지 않는다. setup/start에서 잠금을 획득하고 실제 쓰기 가능 여부를 확인한다.

새 setup/start는 없거나 비어 있는 전용 루트에 `worknaru-data.json` 관리 파일을 만든다. 제품·관리 파일 버전·저장 구조 버전·실제 루트·소유 checkout·상태를 기록한다. 임의의 비어 있지 않은 폴더는 거부한다. 다른 checkout이 소유한 데이터를 재사용하지 않으며 정지를 확인한 명시적 reset으로 폐기한 후 새 환경을 만든다.

개발 단계에서 저장 구조 변경에 대한 마이그레이션은 구현하지 않는다. 버전이 다르면 `reset_required`로 중단하며 DB를 열어 복구하거나 변환하지 않는다. 이전 전용 구성은 삭제 대상으로만 식별한다. 저장소 안의 `.local/paseo-dev`는 [legacy 초기화](../cli/README.md#사용자-데이터-전체-초기화) 전용이며 남아 있으면 setup/start를 막는다.

설정·인증·server ID·Agent 기록·대기열·SQLite와 WAL/SHM·로그·설정 백업·managed worktree·웹 staging·임시 파일은 모두 전용 루트 아래에 둔다. 소스·의존 패키지·빌드 산출물·실제 외부 작업 프로젝트·개인 Paseo 및 Provider 로그인 정보는 초기화 대상에서 제외한다. 저장소의 `.local/dev-build.lock`은 소스 빌드 잠금이며 사용자 데이터가 아니다. 개별 경로 지정·다중 인스턴스·포트 자동 선택·이전 데이터 연결·백업/롤백은 지원하지 않는다.

## 검증 데이터 격리

`dev:verify`, `paseo:verify`, `agent:verify`, `ui:live`는 실행마다 저장소 밖에 새 전용 데이터와 실제 Agent 작업 fixture를 만든다. 테스트 전용 `WORKNARU_TEST_ROOT`가 우선하며 미지정 시 검증된 OS 임시 폴더의 `worknaru-tests`를 사용한다. 경로가 지원되지 않으면 명시적 테스트 루트를 요구한다. 제품 실행의 저장 설정은 여전히 `WORKNARU_DATA_DIR` 하나다. 기존 제품 데이터나 개인 Provider 홈을 테스트 초기화 대상으로 사용하지 않는다.

```powershell
$env:WORKNARU_TEST_ROOT = 'C:\WorknaruTests'
pnpm test
pnpm ui:verify
pnpm dev:verify
pnpm paseo:verify
pnpm agent:verify
pnpm ui:live
```

실연동은 포트 6868을 사용하므로 위 순서로 실행한다. 결과와 실패 로그는 해당 외부 실행 폴더에 남으며, 필요하면 출력된 루트를 `WORKNARU_DATA_DIR`로 지정해 전용 reset을 실행한다. 검증 중 Provider가 개인 저장소에 남긴 로그인·기록은 Worknaru 초기화가 관리하지 않는다.

## 동작과 운영 분리

| 항목 | 값·동작 |
| --- | --- |
| Daemon 데이터 | `WORKNARU_DATA_DIR`; 미설정 시 `%LOCALAPPDATA%\Worknaru-Dev` |
| SDK 접속 주소 | `ws://127.0.0.1:6868/ws` |
| 실행 파일 | 고정된 `@getpaseo/server`의 supervisor 진입점 |
| 설정·로그·worktree·임시 파일 | 전용 데이터 디렉터리 아래 |
| 사용자 홈·인증 | 기존 Windows 사용자 홈과 Provider 인증 환경을 사용 가능 |
| 상속 환경 | 호출자의 `PASEO_*`, `ELECTRON_*`를 제거한 자식 환경에 전용 대상 설정을 전달 |
| 검증에서 끄는 기능 | 릴레이, MCP 주입·도구 호출, 브라우저 도구, 추가 서비스 프록시 리스너, 웹 UI, 음성, 플러그인. `web:dev`에서는 웹 UI만 활성화 |
| 검증 종료 | 전용 Daemon 종료, 리스너 폐쇄·PID 파일 제거 확인 |

1. 포트와 전용 PID 파일을 확인하고 설정을 준비한다. 기존 설정이 예상값과 다르면 덮어쓰지 않고 실패한다.
2. 전용 supervisor를 숨겨진 자식 프로세스로 시작한다. Agent를 만들거나 AI 요청을 보내지 않는다.
3. SDK handshake의 서버 ID를 전용 `server-id` 파일과 비교하고, PID 파일이 이번에 시작한 프로세스를 가리키는지 확인한다.
4. 서버 버전·릴레이 상태와 빈 Agent 목록을 조회한다. 클라이언트를 닫고 다시 연결해 같은 Daemon이 유지되는지도 확인한다.
5. Adapter와 실제 Worknaru CLI 프로세스로 상태 조회와 서버 ID 불일치 처리를 확인하고, Daemon의 PID·시작 시각과 빈 Agent 목록이 유지되는지 확인한다. CLI는 Core API를 거쳐 조회한다.
6. 검증 프로그램이 확인한 연결로 Daemon 종료를 요청한다. 프로세스 종료와 리스너·PID 잠금 정리를 확인하고, Adapter와 CLI가 종료 후 접속 실패를 반환하는지 확인한 뒤 JSON 결과를 출력한다.

실패하면 종료 코드 `1`을 반환한다. 시작한 프로세스가 남아 있으면 이번 실행이 생성한 프로세스 트리만 정리한다. 데이터와 로그는 진단을 위해 남긴다. `.local/`과 프로젝트 의존성·pnpm store는 Git 추적에서 제외한다.

## 실패 시 확인

- 포트가 사용 중이면 실행을 거부한다. 해당 포트의 프로그램을 자동 종료하거나 다른 Paseo로 접속하지 않는다.
- 진단에 표시된 루트의 `paseo.pid`가 있으면 실제 프로세스와 로그를 확인한다. 살아 있는 Daemon이나 소유권이 불명확한 PID를 자동 정리하지 않는다.
- 시작 제한 시간은 45초이며, 개별 접속·조회는 5초, 정상 종료 대기는 20초다. 원인은 진단에 표시된 `daemon.log`와 `launcher.log`에서 확인한다.
- 이전 설정이 남아 충돌하면 `config.json`을 확인한다. 사용자 홈의 `.paseo`를 변경할 필요는 없다.

## SDK 연동에서 확인한 경계

공개 `createPaseoApi(driver).agents.list()`로 세션 목록을 조회한다. 이 버전의 공개 `createPaseoClient()`는 서버 식별 정보·Daemon 상태·종료 API를 제공하지 않아 검증 코드에서 `@getpaseo/client/internal/daemon-client`의 `getLastServerInfoMessage()`, `getDaemonStatus()`, `shutdownServer()`를 사용한다. 서버 패키지의 supervisor 파일 경로도 내부 진입점이다. 이 내부 의존성들은 버전 변경 시 재확인이 필요하다.

제품 Adapter에는 [초기 설계](../../docs/paseo-adapter-initial-design.md)와 [ADR 0005](../../docs/adr/0005-local-development-cli-boundary.md)의 의존 경계를 적용한다. Daemon 생성·종료는 CLI의 로컬 개발 환경 관리와 이 검증 프로그램이 공통 라이브러리로 수행하며, 원시 SDK 비교 조회는 검증 프로그램의 역할이다. Adapter는 조회용 클라이언트만 생성·정리한다. Agent 생성, 작업 중단, 권한 요청과 실제 Provider 인증은 별도 검증 대상이다.

기존 개인용 Paseo의 비교 확인은 이 프로그램의 접속 대상에 포함하지 않는다. 함께 실행 중인 Paseo가 있다면 읽기 전용 상태 조회로 검증 전후의 서버 ID·PID·시작 시각·접속 주소와 응답 상태를 비교한다. 개인용 식별 정보와 로컬 로그는 공개 Issue에 올리지 않는다.
