# 데이터 저장 위치

Worknaru의 전용 실행 데이터, 실제 작업 파일, 개인 Provider 환경, 브라우저 상태는 서로 다른 곳에 저장된다. 이 문서는 현재 Windows 개발 환경에서 **어떤 데이터가 어디에 있고, 언제 지워지는지**를 설명한다. Worknaru Workspace·Project의 최소 메타데이터와 내장 Module 실행 기록을 포함한다.

## 한눈에 보기

아래에서 `D`는 Worknaru 전용 데이터 루트다. `WORKNARU_DATA_DIR`를 지정하면 그 경로를, 미설정 시 `%LOCALAPPDATA%\Worknaru-Dev`를 사용한다.

| 데이터 | 저장 위치 | 관리 주체 |
| --- | --- | --- |
| 전용 Daemon 설정·서버 ID·인증 키·실행 로그 | `D` 아래 설정·관리 파일 | Worknaru 실행기와 Paseo |
| Agent 이름·작업 폴더·모델·보관 상태·Provider 세션 연결 정보 | `D\agents\<작업 폴더별 디렉터리>\<Agent ID>.json` | Paseo |
| 접수한 메시지·전송 결과·대기열 정지 상태·공유 전송 설정 | `D\agent-state.sqlite`와 SQLite 부속 파일 | Worknaru Agent 서비스 |
| Worknaru Workspace·Project의 ID·이름·소속·생성 시각 | `D\worknaru-domain.sqlite`와 SQLite 부속 파일 | Worknaru 도메인 서비스 |
| Module Run의 요청 ID·정의 버전·입력·귀속·상태·결과·시각 | `D\module-runs.sqlite`와 SQLite 부속 파일 | Worknaru Module 서비스 |
| 대화·도구 실행 이력 | Provider 자체 세션 저장소. Paseo가 조회해 화면에 전달 | Provider와 Paseo |
| 관리되는 Git worktree·임시 파일 | `D\worktrees`, `D\tmp` | 전용 실행 환경 |
| Agent가 읽고 수정하는 실제 프로젝트 | Agent 생성 시 지정한 작업 폴더 (`--cwd` 또는 Web 입력) | 사용자와 Agent |
| 개인 Paseo·Provider 설정, 로그인 정보와 자체 기록 | 기존 사용자 환경. 개인 Paseo 홈, Codex의 `CODEX_HOME` 또는 사용자 홈의 `.codex` 등 | 각 프로그램 |
| 테마·패널 너비·접힘 | 해당 사이트의 브라우저 `localStorage`, 서버 ID별 저장 | Worknaru Web |
| 입력 중 초안·대화 캐시·읽던 위치·미저장 설정 | 현재 브라우저 탭 메모리 | Worknaru Web |
| 실연동 검증 데이터·작업 fixture·결과 | `WORKNARU_TEST_ROOT` 또는 OS 임시 폴더의 `worknaru-tests` 아래 실행별 폴더 | 검증 실행기 |
| 제품 소스·의존 패키지·빌드 산출물 | 제품 checkout의 `apps/`, `packages/`, `node_modules/`, 각 `dist/` 등 | Git과 빌드 도구 |

`agent-state.sqlite`는 전체 대화 기록 DB가 아니다. 전송할 메시지 내용과 실행 상태를 저장하고, Agent 세션·대화의 원본을 복제하지 않는다. 현재 고정한 Paseo 0.8.0은 Agent 메타데이터를 파일에 저장하고, 대화 타임라인은 메모리에서 관리하며 Provider에서 이력을 읽는다. 따라서 **Worknaru 데이터 초기화는 Provider 자체 기록 삭제를 뜻하지 않는다.** [Agent 서비스의 저장 책임](../apps/agent-service/README.md)

작업 폴더는 Daemon이 실행되는 컴퓨터의 경로다. 새 Agent에는 기본 작업 폴더가 없으며 사용자가 명시한다. 실제 작업 프로젝트는 전용 데이터 루트 밖에 두어 수명을 분리한다.

`worknaru-domain.sqlite`는 Worknaru 업무 구조의 원본이다. Agent 대화·파일·Paseo의 project/workspace를 복제하지 않으며 브라우저 Local Storage에도 저장하지 않는다. 소유 checkout과 `ready` 마커를 확인한 서버 플러그인만 이 경로에 DB를 연다. 처음 사용하면 빈 스키마를 생성하되 Workspace·Project 레코드는 자동 생성하지 않는다. 알 수 없는 스키마는 자동 삭제·변환하지 않고 오류로 중단한다. [도메인 저장 구현](../apps/agent-service/server/workspace-store.mjs)

`module-runs.sqlite`는 내장 Module의 실행 기록을 보관한다. Module 정의는 서버 코드이며 DB에 실행 코드나 사용자 설치 패키지를 저장하지 않는다. 같은 Module을 실행한 서로 다른 업무의 입력·결과는 각각의 Run에 남는다. 목록은 정확한 실행 맥락으로 구분하며 접근 권한 경계를 뜻하지 않는다. 재시작 시 accepted/running은 uncertain으로 기록하고 자동 실행하지 않는다. 입력 원문과 결과는 전용 DB에 남으므로 사용자가 민감한 텍스트를 입력하면 그 내용도 저장된다.

Module 저장 도입으로 루트 저장 버전은 2다. 버전 1 루트는 DB를 열기 전에 `reset_required`로 거부하며 자동 변환·삭제하지 않는다. 기존 데이터를 보존하려면 새 외부 데이터 루트를 지정한다. 전체 초기화를 선택하면 아래 기존 보존/삭제 범위를 그대로 따른다.

## 설정에서 데이터 관리

관리형 `dev start`와 Agent 설정을 마친 Web의 **설정 → 데이터 관리**에서 실행 PC, 실제 데이터 루트, 설정 출처와 데이터별 경로·관리 주체·존재 상태를 확인한다. 전용 데이터, 외부 작업 폴더·개인 Provider 저장소·제품 소스, 브라우저 상태를 구분한다. 파일 내용이나 인증 키 값은 표시하지 않는다. Agent 작업 폴더 조회가 실패하면 다른 위치 정보와 구분해 안내한다.

**열기**는 Daemon이 실행되는 Windows PC의 탐색기를 연다. 파일 항목은 상위 폴더를 열며, 조회한 경로가 없어졌거나 링크로 바뀌면 거부하고 재조회를 안내한다. 다른 기기에서 접속해도 탐색기는 실행 PC에 나타난다. 브라우저 상태에는 파일 탐색기 열기를 제공하지 않는다. 수동 `web:dev` 등 관리 실행기가 없는 환경에서는 데이터 관리 요청을 거부한다.

**초기화 대상 확인 → 삭제하고 다시 시작**은 전용 루트 전체를 초기화한다. 미리보기는 삭제하지 않으며 60초 동안 유효하다. 실행기 소유권·경로·잠금·worktree 등록을 확인한 뒤, 하나의 작업 잠금 안에서 **Daemon 종료 → 기존 reset으로 삭제 → 새 기본 설정과 Agent 서비스 준비 → Daemon 재시작**을 수행한다. 기존 빌드 자산을 사용하며 코드 재빌드나 Provider 메시지 전송을 하지 않는다. 외부 작업 프로젝트·제품 소스·개인 Paseo·Provider 로그인과 자체 기록은 보존한다.

종료 중 기존 Web 연결은 끊어진다. 요청한 탭은 같은 웹 주소에서 자신의 초기화 요청 ID와 새 서버 ID의 준비 완료를 확인한 뒤 새로고침한다. 다른 오래된 탭은 자동 전환하지 않는다. 2분 안에 완료를 확인하지 못하면 결과 미확인으로 표시하고 다시 확인·CLI 진단을 안내한다. 응답이 끊겼다는 이유로 삭제 요청을 재전송하지 않는다. 실패한 삭제는 기존 `resetting` 보호를 유지하며 자동 재시작하지 않는다. [구현과 검증](../apps/web/README.md#데이터-관리), [결정 근거](adr/0012-settings-data-management.md)

## 현재 적용 경로 확인과 설정

저장소 루트에서 다음 명령을 실행하면 `Data root`에 적용 경로와 출처(`default` 또는 `WORKNARU_DATA_DIR`)가 나온다. 파일이나 디렉터리를 만들지 않는 읽기 전용 진단이다.

```powershell
pnpm exec worknaru doctor
```

자동화에서는 `pnpm exec worknaru doctor --json` 결과의 `dataRoot`를 읽는다. 다른 진단 항목에 문제가 있으면 경로가 표시되어도 종료 코드는 1일 수 있다.

| 설정 | 적용 규칙 |
| --- | --- |
| `WORKNARU_DATA_DIR` | 제품 실행의 저장 루트. 명시한 값이 기본값보다 우선하며, 잘못된 값이면 오류로 중단 |
| `LOCALAPPDATA` | `WORKNARU_DATA_DIR`가 없을 때만 Windows 기본 경로 `%LOCALAPPDATA%\Worknaru-Dev`를 구성 |
| `WORKNARU_TEST_ROOT` | 검증 실행 폴더의 부모 경로. 제품의 기본 저장 루트를 바꾸지 않음 |

별도 제품 루트가 필요하면 같은 PowerShell 세션에서 설정하고 확인한다.

```powershell
$env:WORKNARU_DATA_DIR = 'C:\WorknaruData\Dev'
pnpm exec worknaru doctor
```

이 설정은 현재 PowerShell과 그 자식 프로세스에 적용한다. 다른 터미널에서도 같은 루트를 관리하려면 같은 값을 설정한다. 해제는 `Remove-Item Env:WORKNARU_DATA_DIR`이며, 다음 명령부터 기본 루트를 선택한다. 변수를 변경하거나 해제해도 기존 파일은 이동·삭제되지 않으며, 이미 실행 중인 Daemon의 루트도 바뀌지 않는다. 기존 실행을 관리할 때는 시작할 때와 같은 루트를 사용한다.

루트는 저장소 밖의 공백 없는 절대경로여야 하며 폴더명에는 영문·숫자·`-_.`만 허용한다. 기본 경로도 검사하므로 사용자 경로에 한글·공백이 있으면 지원되는 외부 루트를 명시한다. 제품 checkout과 데이터 루트는 서로 포함할 수 없다. 새 루트는 없거나 비어 있어야 하며 다른 checkout의 기존 데이터를 연결하지 않는다. 자세한 입력 제한과 setup/start 절차는 [저장 위치 설정](../apps/paseo-dev/README.md#저장-위치-설정)을 따른다.

### 실행기가 전달하는 내부 경로

개발자가 환경을 추적할 때 볼 수 있는 값이다. 사용자가 개별 저장 경로를 지정하는 옵션은 아니다.

| 자식 프로세스 환경 변수 | 실행기가 전달하는 값·용도 |
| --- | --- |
| `PASEO_HOME` | `D`. 호출자의 `PASEO_*`를 제거하고 전용 Daemon 홈을 지정 |
| `WORKNARU_AGENT_DATA_ROOT` | `D`. Agent 서비스의 전용 루트 확인 |
| `WORKNARU_AGENT_STATE_FILE` | `D\agent-state.sqlite` |
| `WORKNARU_REPOSITORY_ROOT` | 실행하는 제품 checkout. 서버 플러그인의 소유권·소스 경로 확인 |
| `WORKNARU_PERSONAL_PASEO_HOME` | 호출자의 개인 Paseo 홈을 보존해 데이터 경로 충돌 검사에 사용 |
| `TEMP`, `TMP` | 전용 Daemon 자식 환경에서 `D\tmp`로 지정 |
| `PASEO_WEB_UI_DIST_DIR` | Web을 제공할 때 생성한 `D\tmp\web-*` |

사용자 홈과 Provider 인증 환경은 함께 사용할 수 있다. `WORKNARU_DATA_DIR`는 개인 Provider 홈이나 로그인 위치를 변경하지 않는다. 전달 규칙은 [공통 실행 코드](../packages/dev-environment/daemon.mjs)에 있다.

## 전용 데이터 루트의 주요 파일

사용한 기능과 실행 상태에 따라 파일이 생긴다. 아래는 주요 항목이며 초기화 대상을 한정하는 목록은 아니다.

```text
D/
├── worknaru-data.json             # 제품·소유 checkout·저장 구조 버전·초기화 상태
├── config.json                    # 전용 Daemon·플러그인 설정
├── config.before-agents-*.json     # agent setup이 남기는 기존 설정 백업
├── server-id                      # 전용 서버 식별자
├── daemon-keypair.json            # 전용 Daemon 인증 키
├── agents/
│   └── <작업 폴더별 디렉터리>/
│       └── <Agent ID>.json        # Agent 메타데이터·Provider 세션 연결 정보
├── projects/                      # Paseo 실행 기반의 프로젝트·workspace 등록 정보
├── agent-state.sqlite             # 전송 설정·요청·대기열 상태
├── agent-state.sqlite-wal         # SQLite가 필요할 때 생성하는 부속 파일
├── agent-state.sqlite-shm
├── worknaru-domain.sqlite          # Worknaru Workspace·Project 메타데이터
├── worknaru-domain.sqlite-wal      # SQLite가 필요할 때 생성하는 부속 파일
├── worknaru-domain.sqlite-shm
├── module-runs.sqlite             # Module 입력·귀속·상태·결과·접수 ID
├── module-runs.sqlite-wal          # SQLite 부속 파일
├── module-runs.sqlite-shm
├── dev-instance.json              # 관리 실행기 소유권·제어 기록
├── paseo.pid                      # 전용 Daemon 프로세스 기록
├── dev-operation.lock             # setup·시작·종료·초기화의 동시 작업 잠금
├── daemon.log                     # Daemon 로그
├── launcher.log                   # Daemon 시작 프로세스 출력
├── dev-runner.log                 # 백그라운드 관리 실행기 출력
├── build.log                      # 관리형 dev start의 최근 빌드 출력
├── worktrees/                     # 전용 환경이 관리하는 Git worktree
└── tmp/
    └── web-*/                     # 실행별 공개 웹 자산
        └── connection.json        # 공개 접속 대상·예상 서버 ID
```

`projects/`는 Paseo 실행 기반의 등록 정보이며 Worknaru의 Module·Workspace 저장 기능을 뜻하지 않는다. Paseo는 사용한 기능에 따라 플러그인 관련 파일 등을 추가할 수 있다. 내부 파일 배치는 고정된 Paseo 버전을 바꿀 때 다시 확인한다.

웹 서버는 `tmp/web-*`의 허용된 빌드 자산과 `connection.json`을 제공한다. 데이터 루트 전체를 웹에 공개하지 않으며, 인증 값·DB·설정·로그는 공개 웹 자산에 포함하지 않는다. 임시 웹 폴더는 해당 실행 종료 시 정리한다. [웹 파일 준비](../packages/dev-environment/web-files.mjs)

제품 checkout의 `.local/dev-build.lock`은 같은 소스의 동시 빌드를 막는 잠금이다. 이전 `.local/paseo-dev`는 현재 저장 위치가 아니며 [legacy 초기화](../apps/cli/README.md#사용자-데이터-전체-초기화) 대상으로만 취급한다. 의존 패키지·빌드·UI 검증 산출물(`node_modules/`, 각 `dist/`, `storybook-static/`, `test-results/`, `playwright-report/`)은 제품 개발 파일로 구분한다.

## 종료·보관·초기화 시 남는 것

아래의 전체 초기화는 정지된 전용 루트에 `dev reset --yes`를 실행하는 경우다. Web에서 확인한 초기화도 같은 삭제 범위를 사용하며, 삭제 성공 후 새 설정·서버 ID·인증 키와 Agent 서비스를 준비해 바로 다시 시작한다.

| 대상 | 탭·터미널 종료 | 정상 `dev stop` 후 `dev start` | 전체 초기화 |
| --- | --- | --- | --- |
| 전용 설정·서버 ID·인증 키·Agent 등록·대기열·공유 전송 설정 | 유지 | 유지 | 삭제 후 새 setup/start에서 새로 생성 |
| Worknaru Workspace·Project | 유지 | 같은 ID·소속·생성 시각으로 유지 | DB·부속 파일 삭제, 다음 시작 시 빈 저장소 |
| Module Run | 유지 | 완료 기록 보존, 미완료는 uncertain으로 보존 | DB·부속 파일 삭제, 다음 시작 시 빈 저장소 |
| 전용 로그 | 유지 | 다음 실행에서 추가·갱신 (`build.log`는 빌드 시 덮어씀) | 삭제 |
| 설정 백업·관리 worktree | 유지 | 유지 | 삭제 |
| 실행 기록·PID·작업 잠금 | 관리형 실행은 터미널과 독립 | 정상 종료·작업 완료 시 소유한 기록과 잠금 정리 | 정지·소유권 확인 후 정리 |
| `tmp/web-*` | 실행이 계속되면 유지 | 해당 실행 종료 시 정리, 다음 시작 때 생성 | 삭제 |
| 기타 전용 임시 파일 | 남을 수 있음 | 남을 수 있음 | 삭제 |
| 실제 외부 작업 프로젝트·제품 소스 | 유지 | 유지 | 보존 |
| 개인 Paseo·Provider 로그인과 자체 기록 | Worknaru가 삭제하지 않음 | Worknaru가 삭제하지 않음 | Worknaru가 삭제하지 않음 |
| 브라우저 테마·패널 선호 | 같은 브라우저에 유지 | 같은 server ID이면 유지 | 새 환경을 새로고침할 때 이전 서버 선호 정리 |
| 브라우저 초안·캐시·읽던 위치·미저장 설정 | 탭 종료·새로고침 시 소실 | 열린 탭에서만 유지 가능 | 새 환경을 새로고침할 때 복원하지 않음 |

관리형 `dev start`는 터미널을 닫아도 계속 실행된다. 수동 검증용 `web:dev`는 터미널에 연결되어 있으므로 구분한다. Daemon을 정지하면 Agent 실행도 멈추지만 저장된 대기 메시지는 남는다. 재시작 시 결과가 확정되지 않은 전송은 `uncertain`으로 멈추며 자동 재전송하지 않는다. Agent **보관**은 실행·대기열을 정리하고 기록과 작업 파일을 남긴다.

전체 초기화는 전용 루트 전체를 대상으로 하며 DB만 지우는 작업이 아니다. 정상 루트에는 폴더와 빈 상태의 `worknaru-data.json`이 남는다. 관리 worktree는 Git 등록 관계를 확인해 제거하고, 외부 링크는 대상 파일을 지우지 않고 링크만 제거한다. 개발 단계의 저장 구조 변경에는 마이그레이션·자동 이전을 제공하지 않는다.

초기화는 `dev stop` 후 `pnpm exec worknaru dev reset --dry-run`으로 삭제·제외·차단 항목을 확인하고 `--yes`로 수행한다. 이후 `doctor → agent setup → dev start → status`로 새 환경을 준비하고 열린 Web을 새로고침한다. 구체적인 실행·실패 처리 절차는 [CLI 초기화 안내](../apps/cli/README.md#사용자-데이터-전체-초기화), 결정 근거는 [ADR 0011](adr/0011-external-data-and-development-reset.md)에 있다.

## 브라우저 저장 위치

브라우저 개발자 도구에서 해당 사이트의 Local Storage를 확인한다. 테마와 레이아웃은 브라우저 프로필·사이트별이며 CLI와 공유하지 않는다. CLI/Web이 공유하는 메시지 전송 설정은 서버의 `agent-state.sqlite`에 있다.

| 저장 항목 | 키 또는 위치 |
| --- | --- |
| 테마 | `worknaru.ui.server.<인코딩한 server ID>.theme` |
| 패널 너비·접힘·상세 패널 열림 | `worknaru.ui.server.<인코딩한 server ID>.layout.v1` |
| 접속 환경의 마지막 서버 ID | `worknaru.ui.environment.<인코딩한 접속 환경>` |
| 선택한 Agent·보관함·설정 섹션 | URL과 현재 탭의 탐색 상태 |
| Agent별 초안·대화 캐시·읽던 위치·미저장 편집 | 현재 탭 메모리. Local Storage에 대화·초안을 저장하지 않음 |

서버 ID는 `encodeURIComponent`, 접속 환경은 `[endpoint, target]`의 JSON을 같은 함수로 인코딩한다. 브라우저 저장이 차단되어도 현재 탭에서는 화면 설정을 사용할 수 있다. 초기화 후 새 서버 ID를 읽으면 이전 선호를 정리하며, 정상 stop/start는 같은 ID를 사용한다. [Web 사용 안내](../apps/web/README.md#전체-초기화-후-새로고침)

## 검증 데이터와 확인할 코드

`dev:verify`, `paseo:verify`, `agent:verify`, `ui:live`는 제품 데이터와 별개로 저장소 밖에 실행별 폴더를 만든다. 테스트 루트는 `WORKNARU_TEST_ROOT`가 우선하며 기본값은 Node의 `os.tmpdir()` 아래 `worknaru-tests`다. Windows에서는 보통 `%TEMP%\worknaru-tests`에 해당한다. 테스트 루트에도 공백 없는 ASCII 절대경로 규칙을 적용한다.

```powershell
$env:WORKNARU_TEST_ROOT = 'C:\WorknaruTests'
```

실행별 폴더에는 검증에 필요한 전용 데이터, 작업 fixture나 복사 checkout, 결과·실패 자료가 들어갈 수 있다. 검증마다 하위 구조가 다르므로 실행 출력의 경로를 확인한다. 실연동 결과·실패 로그는 진단을 위해 남기며, Provider가 개인 환경에 남긴 기록은 별도로 유지된다. 실행 전제와 명령 순서는 [검증 데이터 격리](../apps/paseo-dev/README.md#검증-데이터-격리)를 따른다.

경로·저장 동작을 변경할 때는 이 개요와 해당 기능 안내를 함께 확인한다.

| 확인할 구현 | 담당 내용 |
| --- | --- |
| [paths.mjs](../packages/dev-environment/paths.mjs), [storage.mjs](../packages/dev-environment/storage.mjs) | 제품 루트·파생 경로·소유권·저장 구조 마커 |
| [local-support.mjs](../apps/cli/local-support.mjs), [data-reset.mjs](../apps/cli/data-reset.mjs) | 관리 실행 기록·로그 경로·초기화 범위 |
| [Agent 서비스](../apps/agent-service/README.md) | Agent queue DB·Workspace/Project DB와 Paseo/Provider의 책임 구분 |
| [storageIdentity.ts](../apps/web/src/shell/storageIdentity.ts), [theme.ts](../apps/web/src/shell/theme.ts), [layout.ts](../apps/web/src/shell/layout.ts) | 브라우저 키·서버별 선호·초기화 |
| [testing.mjs](../packages/dev-environment/testing.mjs) | 외부 검증 실행 폴더 생성 |

Paseo 내부 경로는 설치된 `@getpaseo/server` 0.8.0의 `dist/server/server/config.js`, `agent/agent-storage.js`, `agent/agent-timeline-store.js`, `bootstrap.js`에서 확인한다. 의존 버전은 [공통 개발 설정](../packages/dev-environment/config.mjs)과 [잠금 파일](../pnpm-lock.yaml)을 따른다.
