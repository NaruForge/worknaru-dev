# Project instructions

## 목적과 적용 범위

> 누구나 자신의 업무를 AI 기반 Module로 만들고, 그것들을 하나의 Workspace에서 조합·실행할 수 있게 하는 플랫폼.

이 문서는 Worknaru 저장소를 개발하는 Agent의 지침이다. 제품이 관리하는 사용자 Agent·System Agent·Module 실행용 지침과 구분한다. 현재 CLI·Web은 Agent 생성·대화·대기열·권한·보관을 제공하며, Module·Worknaru Workspace의 개발·조합·실행과 저장 관계는 후속 설계 대상이다.

## 작업 시작과 문서 선택

저장소 작업과 아키텍처 결정에 앞서 [프로젝트 기록 규약](docs/project-records.md)을 읽고 따른다. 코드·문서 변경에도 공통으로 적용한다. 사용자가 승인한 범위에서 진행하고 이미 승인된 작업의 승인을 반복해서 요구하지 않는다.

아래 문서는 해당 작업에 맞춰 읽는다. `apps/`는 실행·배포하는 프로그램, `packages/`는 이를 구성하는 라이브러리다. 파일·패키지를 추가하거나 이동하기 전에는 저장소 구조 규칙을 먼저 읽는다.

| 작업 | 읽을 원본 |
| --- | --- |
| 제품 개념·구성요소·호출 흐름 | [용어집](docs/glossary.md), [개념 아키텍처](docs/architecture.md) |
| 코드 위치·파일 또는 패키지 추가/이동 | [저장소 구조 규칙](docs/repository-structure.md), 관련 패키지 README |
| Core·Runtime·Adapter·서비스 경계 | [아키텍처](docs/architecture.md), [ADR 0005](docs/adr/0005-local-development-cli-boundary.md), 관련 README와 유효한 ADR |
| 제품 UI | [UI 표준과 조립 절차](docs/ui-design.md)의 공개 부품·실행 예제·검증 안내 |
| 브랜딩 | [리브랜딩 설정](packages/branding/README.md)의 지원 범위·입력 규칙 |
| 데이터·저장 루트·초기화 | [데이터 저장 위치](docs/data-storage.md) → [저장 위치 설정](apps/paseo-dev/README.md#저장-위치-설정)·[CLI 초기화](apps/cli/README.md#사용자-데이터-전체-초기화), [ADR 0011](docs/adr/0011-external-data-and-development-reset.md) |
| 개발 환경·실연동 | [CLI 안내](apps/cli/README.md), [검증 데이터 격리](apps/paseo-dev/README.md#검증-데이터-격리) |

## 핵심 경계와 데이터 보호

- 제품 기능은 앱 → Core → Runtime → Adapter를 따른다. Runtime은 Core와 Adapter 사이의 계약이며 별도 서버가 아니다. 앱 시작 코드는 Adapter를 생성해 Core에 주입하고, 제품 처리 코드는 Core API를 사용한다. Core에 Paseo SDK나 UI 책임을 넣지 않는다.
- 로컬 개발 환경 관리는 앱 계층과 Node 전용 `packages/dev-environment`가 맡는다. 이 공통 라이브러리는 SDK·supervisor를 사용할 수 있다. 제품 Core·Runtime·Adapter에서 이 Node 전용 라이브러리를 가져오지 않는다. 상세 경계는 ADR 0005를 따른다.
- 사용자 변경을 임의로 삭제하거나 덮어쓰지 않는다. Daemon 제어는 소유권과 대상을 확인한 전용 개발 환경에 한정하며 개인용·다른 세션의 Daemon을 임의로 중단하지 않는다. 포트나 PID만 보고 종료하지 않는다.
- 사용자 데이터는 저장소 밖의 `%LOCALAPPDATA%\Worknaru-Dev` 또는 명시적 `WORKNARU_DATA_DIR`에 둔다. 데이터 루트와 제품 checkout은 서로 포함할 수 없으며 다른 checkout의 기존 데이터를 연결하지 않는다. 실행 checkout·데이터·Agent 작업 폴더는 공백 없는 ASCII 절대경로와 영문·숫자·`-_.` 폴더명을 사용하고 기본 경로도 검증한다. 새 Agent의 작업 폴더는 사용자가 명시하며 제품 저장소를 자동 입력하지 않는다.
- 개발 단계의 저장 구조 변경은 마이그레이션하지 않고 전용 데이터를 초기화해 시작한다. 정상 재시작에서는 데이터를 유지한다. 전체 초기화는 정지·소유권·경로를 확인한 뒤 `pnpm exec worknaru dev reset --dry-run`으로 대상을 검토하고 `--yes`로 실행한다. 실제 작업 프로젝트·제품 소스·개인 Paseo 및 Provider 로그인 정보는 삭제하지 않는다. 세부 절차와 보호 범위는 CLI 초기화 안내와 ADR 0011을 따른다.
- 사용자용 제품 문구는 [공통 브랜드 정의](packages/branding/README.md), 개발 실행기의 경로는 [공통 경로 해석](packages/dev-environment/paths.mjs)을 사용한다. 이름 변경이 데이터·서버 ID·인증 정보에 영향을 주지 않게 한다.

리브랜딩 지원 범위는 빌드 시 고정하는 표시 이름·로고·파비콘·대표 색상·홈페이지/문서/지원 링크와 `WORKNARU_DATA_DIR`로 지정하는 단일 저장 루트다. CLI 명령 `worknaru`, 환경 변수 접두사, 패키지·API·내부 식별자 변경과 실행 중 브랜드 전환·개별 저장 경로·자동 데이터 이전·OS 서비스 이름 변경은 지원하지 않는다. 표시명·이미지·URL의 상세 입력 계약은 리브랜딩 설정을 따른다.

## 개발과 검증

패키지 관리는 루트 [package.json](package.json)의 `packageManager`에 지정된 pnpm을 사용한다. 개발 환경을 실행할 때 기본 흐름은 `pnpm exec worknaru doctor` → `pnpm exec worknaru dev start` → `pnpm exec worknaru status` → `pnpm exec worknaru dev stop`이다. 최초 Agent 설정 등 사전 준비는 CLI 안내를 따른다.

| 변경·검증 대상 | 실행 기준 |
| --- | --- |
| 지침·일반 문서만 변경 | 링크·앵커·명령 존재 여부·정책 일치와 `git diff --check`를 확인하고 기존 CI를 따른다. 문서 변경만으로 실제 데이터 초기화나 Provider 호출을 요구하지 않는다. |
| 코드 수정 중 | 해당 패키지에 실제 존재하는 테스트 명령과 필요한 선행 빌드를 사용한다. 영향받는 호출부·계약도 확인한다. |
| 코드 변경 완료 전 | 저장소 루트의 `pnpm test`로 전체 빌드와 자동 테스트를 실행한다. |
| UI·상호작용 변경 | UI 표준에 따라 `pnpm test`, `pnpm ui:verify`와 관련 화면·키보드·접근성 검증을 수행한다. |
| 실행기·Adapter·실제 Agent 연동 영향 | 검증 데이터 격리 안내에 따라 `pnpm dev:verify`, `pnpm paseo:verify`, `pnpm agent:verify`, `pnpm ui:live` 중 영향받는 검증을 선택한다. |

실연동 검증은 저장소 밖의 실행별 데이터와 작업 fixture를 사용하며 테스트 전용 `WORKNARU_TEST_ROOT`를 지원한다. 안내에 따라 관리형 개발 환경을 먼저 종료하고, 고정 포트를 사용하는 검증은 직렬로 실행한다. 실제 Provider를 사용하는 검증은 설치·로그인·사용량 조건을 확인한다.

명령·옵션은 현재 package.json과 해당 README에서 대조한다. 검증 결과에는 실행 명령과 범위를 남기고 미실행·실패·환경 제약을 구분한다. 기존 결과를 재사용할 때는 대상 커밋·환경·검증 범위가 이번 변경을 포함하는지 확인한다.

## 문서 유지와 결과 기록

새 설명은 해당 주제의 기존 문서에 통합한다. 상세 계약·사용법·검증 절차는 그 문서가 소유하고 루트에는 공통 행동 규칙과 링크를 둔다. 동작 변경 시 관련 안내를 함께 갱신하며, 소스·자동 생성 값의 별도 원본을 만들거나 과거 ADR·Issue·PR의 결정 근거를 삭제하지 않는다.

코드와 유효한 문서가 충돌하면 차이와 영향을 보고한다. 코드의 존재만으로 정책 변경을 추정하거나 승인 범위 밖의 코드를 문서에 맞춰 수정하지 않는다.

작업 범위·완료 조건은 Issue 본문, 논의·검증 근거는 Issue/PR, 진행 상태는 저장소 전용 Project의 Status, 장기 결정은 ADR에 둔다. 기록 원본·진행 상태·ADR 상태를 다른 문서나 tracker에 중복 관리하지 않으며 기록 체계 변경은 별도로 제안한다. 구체적인 승인·종료 절차는 프로젝트 기록 규약을 따른다.
