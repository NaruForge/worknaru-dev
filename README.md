# Worknaru

누구나 자신의 업무를 AI 기반 Module로 만들고, 그것들을 하나의 Workspace에서 조합·실행할 수 있게 하는 플랫폼.

현재 CLI와 Web UI에서 Codex Agent를 생성·조회하고, 메시지 전송·응답 확인·후속 대화·보관까지 사용할 수 있다. 지속 대기열, 진행 중인 작업에 추가 지시, 권한 승인·거부와 질문 응답을 지원한다. Module·Worknaru Workspace·Project의 관계와 실행 맥락은 제품 계약으로 정했으며, 관리·개발·조합·실행 기능은 후속 구현 대상이다.

[용어집](docs/glossary.md)은 제품과 실행 기반의 핵심 용어를 정의한다. [개념 아키텍처](docs/architecture.md)는 채택한 업무 관계·실행 맥락과 현재 CLI·Web UI의 구성요소·호출 흐름을 구분해 설명한다.

[데이터 저장 위치](docs/data-storage.md)에서 설정·Agent·대화·작업 파일·브라우저·검증 데이터의 위치를 한눈에 확인할 수 있다. `WORKNARU_DATA_DIR`와 `WORKNARU_TEST_ROOT`, 주요 폴더 구조, 종료·초기화 시 보존 범위를 함께 설명한다.

Web은 앱 탐색·Agent 목록·대화·상세 정보를 구분하고, 통합 설정에서 화면 테마·전송 방식·연결 진단을 제공한다. 같은 탭에서 설정과 다른 Agent를 오가도 초안과 읽던 위치를 유지한다. 패널 너비·접힘은 브라우저에 기억하며 작은 화면에서는 목록과 대화를 전환한다. UI를 개발하는 사람과 AI는 [UI 조립 안내](docs/ui-design.md)에서 공개 부품과 실제 예제를 찾는다. 개발용 카탈로그는 `pnpm ui:storybook`, 브라우저·접근성·화면 검증은 `pnpm ui:verify`로 실행한다.

개발 환경에서 CLI를 사용하려면 [Worknaru CLI 실행 안내](apps/cli/README.md)를 참고한다. Daemon 연결과 CLI 연동은 [Paseo 개발 환경 검증](apps/paseo-dev/README.md)에서 확인한다.

Windows·Node.js 24 LTS와 루트 `packageManager`의 pnpm을 준비한 뒤, 저장소 루트에서 실행한다.

```powershell
pnpm install --frozen-lockfile
pnpm exec worknaru doctor
pnpm exec worknaru agent setup
pnpm exec worknaru dev start
pnpm exec worknaru status
# 실제 작업할 기존 폴더를 지정합니다.
pnpm exec worknaru agent create --name "작업 도우미" --cwd C:\Projects\MyWork
pnpm exec worknaru agent send "작업 도우미" "이 폴더에서 할 수 있는 일을 설명해 주세요."
pnpm exec worknaru agent send "작업 도우미" "그중 첫 번째를 더 설명해 주세요."
pnpm exec worknaru agent archive "작업 도우미"
pnpm exec worknaru dev stop
```

`dev start`는 빌드 후 Daemon과 Web UI를 백그라운드에서 시작한다. 준비 완료 뒤 `http://127.0.0.1:6868/`를 열고, 종료는 `dev stop`으로 한다. 실행 중인 환경은 재사용하며 `doctor`와 `status`는 읽기 전용이다. 전역 설치와 별도 Daemon 터미널은 필요하지 않다. 상세 옵션·실패 해결은 [CLI 안내](apps/cli/README.md), 화면 확인은 [Web UI 안내](apps/web/README.md)를 따른다.

`agent setup`은 개발 환경이 정지했을 때 최초 한 번 실행한다. 전용 Daemon에 Agent 실행 플러그인을 준비하며 기존 기본 설정은 백업한다. Codex가 설치되고 로그인된 환경이 필요하다. Agent 생성 시 작업 폴더를 명시한 뒤 모델 목록을 조회한다. 위 예시의 `C:\Projects\MyWork`는 실제 작업할 기존 폴더로 바꾼다. 대화형에서는 `--cwd`를 생략하고 직접 입력할 수 있으며, 비대화형과 `--json`에서는 `--cwd`가 필수다. 전송 방식은 CLI의 `settings set send-mode queue|steer` 또는 Web의 **설정 → Agent 동작**에서만 변경한다. 기본 전송 방식은 대기열이며, 터미널·탭을 닫아도 Daemon이 살아 있는 동안 순서대로 실행한다. 보관은 실행 중인 작업과 하위 Agent에 미치는 영향을 확인한 뒤 진행하고 기록·파일을 보존한다.

설정으로 자신의 브랜드를 쉽게 적용할 수 있다. 표시 이름·로고·파비콘·대표 색상·홈페이지/문서/지원 링크를 바꾸고 `pnpm build`로 반영한다. 기본 사용자 데이터는 `%LOCALAPPDATA%\Worknaru-Dev`에 저장하며 `WORKNARU_DATA_DIR`로 외부 루트 하나를 지정한다. [리브랜딩 설정](packages/branding/README.md) · [저장 위치 설정](apps/paseo-dev/README.md#저장-위치-설정)

표시 이름에는 한글과 일반 공백을 쓸 수 있다. 이미지 파일명은 `logo.png`와 `favicon.png`/`favicon.ico`, 링크 입력은 ASCII URL로 제한한다. 데이터 루트는 기본값까지 포함해 폴더명에 영문·숫자·`-_.`만 허용한다. 실행 checkout과 Agent 작업 폴더도 같은 경로 규칙을 따른다. 기본 사용자 경로가 미지원이면 지원되는 외부 루트를 명시한다.

CLI 명령 `worknaru`, 환경 변수 접두사, 패키지·API·내부 식별자 변경은 지원하지 않는다. 실행 중 브랜드 전환, 개별 저장 경로 지정, 기존 데이터 자동 이전과 OS 서비스 이름 변경도 지원 범위에 포함하지 않는다.

코드나 문서를 변경하기 전에 [프로젝트 기록 규약](docs/project-records.md)을 읽는다. 파일·패키지의 배치는 [저장소 구조 규칙](docs/repository-structure.md)을 따른다. 작업 중에는 [변경별 검증 선택](apps/paseo-dev/README.md#검증-선택)에 따라 관련 검사부터 수행한다. 전체 빌드·자동 테스트는 `pnpm test`, 전체 UI 회귀는 `pnpm ui:verify`다. 개별 UI 동작·접근성은 `pnpm ui:verify:functional`로 선택 검사하며 전체 시각 회귀의 대체 근거가 아니다. 실제 Windows 시작·종료 경계를 변경하면 개발 환경을 끈 뒤 `pnpm dev:verify`를 선택한다.

개발 단계의 저장 구조 변경은 마이그레이션하지 않는다. `dev stop` 후 `pnpm exec worknaru dev reset --dry-run`으로 대상을 확인하고 `--yes`로 전용 데이터 전체를 초기화한다. 실제 작업 프로젝트·소스·개인 Paseo 및 Provider 로그인은 보존한다. 초기화 후 `doctor → agent setup → dev start → status`로 새 환경을 만들고 열린 Web을 새로고침한다. [초기화 안내](apps/cli/README.md#사용자-데이터-전체-초기화)
