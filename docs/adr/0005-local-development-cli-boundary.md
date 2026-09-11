# 0005. 제품 호출 경계를 유지하며 CLI에서 로컬 개발 환경 관리

- 날짜: 2026-09-11
- 상태: Accepted
- 승인 근거: 사용자가 doctor / dev start / dev stop / status 계획에 대해 다른 프로젝트의 범용적 방법인지 검토한 뒤 구현하고 PR까지 진행하도록 지시했다.
- 관련 Work Item: [CLI 개발 환경 통합 #15](https://github.com/NaruForge/worknaru-dev/issues/15).
- 대체 결정: [ADR 0001](0001-runtime-interface-and-paseo-adapter.md), [ADR 0003](0003-shared-core-and-adapter-in-cli-and-browser.md). 제품 기능의 Core·Runtime·Adapter와 브라우저 실행 구조는 유지하고, CLI 명령 전체를 제품 API 호출로 한정했던 경계를 구분한다.
- 유지하는 결정: [빌드 시 브랜드·단일 데이터 루트 ADR 0004](0004-build-time-branding-and-data-root.md).
- 구현 링크: [CLI 진입점](../../apps/cli/entry.mjs), [로컬 관리](../../apps/cli/local.mjs), [백그라운드 실행기](../../apps/cli/dev-runner.mjs), [공통 개발 환경](../../packages/dev-environment/README.md), [제품 조회](../../apps/cli/src/cli.ts), [Core](../../packages/core/src/index.ts), [웹 시작 코드](../../apps/web/src/bootstrap.ts).

## Context

초기 CLI는 별도 Daemon 터미널과 주소·서버 ID 입력이 필요했다. 개발자가 실행기의 내부 구성을 알아야 시작할 수 있어, 진단 출력 개선만으로는 기본 사용성을 해결하지 못한다.

[Supabase CLI](https://supabase.com/docs/reference/cli/supabase-start)는 start/stop/status와 준비 상태 확인을, [DDEV](https://docs.ddev.com/en/stable/users/usage/commands/)는 프로젝트 기준 start/stop/describe를, [Homebrew](https://docs.brew.sh/Manpage#doctor-dr---list-checks---audit-debug-diagnostic_check-)는 doctor 진단을 제공한다. 보편적으로 쓰이는 명령 구성과 프로젝트 기본 대상 원칙을 차용할 수 있다. 이 사례가 하나의 표준 규격이나 Docker 도입의 근거는 아니다.

기존 CLI와 검증 앱을 서로 의존시키면 순환이 생긴다. 또한 실행·파일 관리를 Core에 넣으면 브라우저에서도 쓰는 제품 계약에 Windows 개발 환경 책임이 섞인다.

## Decision

- 제품 기능은 CLI/웹 → Core → Runtime → Adapter를 따른다. Core는 Worknaru Runtime 계약에 의존하고 Paseo SDK 타입·응답·제품 오류 변환은 Adapter 안에 둔다. Runtime 기능은 실제 제품 필요에 따라 추가한다.
- CLI와 Web UI는 같은 Core·Runtime·Adapter 코드를 각 환경에서 인스턴스화한다. CLI에서는 Node.js, 웹에서는 브라우저 안에서 실행하고 Paseo Client가 Daemon에 직접 WebSocket으로 연결한다. 앱은 메모리·연결을 공유하지 않는다. 별도 제품 API 서버를 필수로 두지 않는다.
- CLI의 doctor, dev start/stop과 기본 대상 선택은 로컬 개발 환경을 다루는 앱 계층 기능이다. 공통 경로·설정·Paseo 실행·웹 자산 준비는 Node 전용 `packages/dev-environment`로 공유한다. 이 라이브러리는 SDK와 supervisor를 사용할 수 있으며 제품 Core·Runtime·Adapter에는 이를 의존시키지 않는다.
- 빌드 전 실행 가능한 경량 진입점을 두고 제품 조회 모듈과 Paseo 의존성을 늦게 불러온다. 최초 의존성 설치는 사용자가 수행한다. doctor/status는 설치·빌드·쓰기 검사·실행 상태 변경·자동 복구를 하지 않는다.
- 정지 상태의 dev start는 빌드 후 숨겨진 detached 실행기를 시작한다. 실행 중인 정상 환경은 재사용한다. 관리 실행기는 실제 자식 핸들을 유지하고 로컬 제어 채널·실행 기록의 소유권과 서버 식별자, Core 응답과 웹 접속 설정을 확인한다. 준비 완료 후 터미널을 반환하며 부모 터미널 종료가 정상 실행의 수명을 끝내지 않는다.
- dev stop은 확인된 관리 실행기에 정상 종료를 요청한다. 이미 정지했다면 성공한다. 단순 PID 일치나 포트 응답만으로 타 프로세스를 제어하지 않는다. 잠금·제한 시간·이번 실행의 실패 정리를 적용하고 불명확한 기록은 자동 삭제하지 않는다.
- 기본 status는 현재 데이터 루트의 관리 인스턴스를 조회한다. 명시적 연결 옵션·환경 변수가 하나라도 있으면 주소/서버 ID 전체 설정을 요구하고 누락 값을 기본 대상으로 보충하지 않는다. 기존 명시적 조회의 DaemonStatus JSON·종료 코드 계약을 보존한다.
- 초기 관리 범위는 Windows, loopback 고정 포트 6868의 한 환경이다. Docker·OS 서비스·전역 배포·자동 시작·새 자동 재시작 정책·다중 인스턴스·hot reload·자동 데이터 이전은 포함하지 않는다. 브랜드·단일 저장 루트의 제한도 유지한다.

## Consequences

개발자는 내부 연결 정보를 입력하지 않고 한 터미널에서 개발 환경을 관리할 수 있다. 상태 조회의 제품 계약과 브라우저 코드에는 로컬 파일·프로세스 의존성이 추가되지 않는다. Windows 로컬 제어 채널은 제품의 원격 API나 서비스 등록 기능이 아니다.

대신 실행기의 수명·소유권·동시 작업·제한 시간·실패 정리를 검증할 책임이 생긴다. Paseo 내부 supervisor와 정상 종료 API는 고정 버전에서 검증하며 업그레이드 때 실제 CLI·Daemon·Web UI 흐름을 다시 확인한다. 중단 뒤 소유권이 불명확한 기록은 사람이 확인하므로 자동 복구보다 보수적으로 동작한다.

브라우저 코드·앱 입력·제품 데이터/세션 정책은 구분한다. 현재 API는 일회성 상태 조회이며 Module·Workspace 저장 모델, 지속 연결·다중 사용자·제품 배포 방식은 후속 결정 대상이다. 운영 분리는 사용자 홈·Provider 인증이나 OS 계정의 격리를 보장하지 않는다.
