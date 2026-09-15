# Worknaru 개발 Agent 지침

Worknaru는 누구나 자신의 업무를 AI 기반 Module로 만들고, 하나의 Workspace에서 조합·실행할 수 있게 하는 플랫폼이다.

이 문서는 **제품 저장소 개발용 지침**이다. 제품의 사용자 Agent·System Agent·Module 실행용 지침과 구분한다. 제품 개념·현재 구현·미결정 범위는 용어집과 아키텍처 문서가 소유한다.

## 작업 시작

코드·문서 변경과 아키텍처 결정 전에 [프로젝트 기록 규약](docs/project-records.md)을 읽고 따른다. 승인 범위·완료 조건을 확인하고 이미 받은 승인을 반복해서 요구하지 않는다.

`git status --short`와 관련 diff를 확인하고 사용자·다른 Agent의 변경을 임의로 삭제·덮어쓰기·되돌리지 않는다. 그 밖의 문서는 작업에 맞춰 아래 원본과 관련 README를 선택해 읽는다.

## 저장소 안내

`apps/`는 실행·배포 프로그램, `packages/`는 라이브러리다. 아래는 탐색용 요약이며 상세 책임은 아키텍처 문서를 따른다.

| 위치 | 역할 |
| --- | --- |
| `apps/cli` | CLI와 로컬 개발 환경 진입점 |
| `apps/web` | 제품 Web UI |
| `apps/agent-service` | Daemon 플러그인으로 실행하는 Agent 서비스 |
| `apps/paseo-dev` | 전용 Paseo 개발 환경 실행·연동 검증 |
| `packages/core` | 제품 API와 Agent 운영 정책 |
| `packages/runtime` | 실행 계약과 공통 결과·오류 타입 |
| `packages/paseo-adapter` | Paseo 연결·변환과 서비스 실행 Driver |
| `packages/dev-environment` | Node 전용 경로·설정·개발 프로세스 관리 |
| `packages/ui` | 공통 UI 부품과 디자인 토큰 |
| `packages/branding` | 빌드 시 확정하는 제품 표시 정의 |

파일·패키지를 추가하거나 이동하기 전에는 저장소 구조 규칙을 따른다. 미래 구성을 예상해 빈 폴더나 패키지를 만들지 않는다.

## 문서 선택

현재 규칙·사용법과 설계 근거·참고자료를 구분한다. `docs/`의 조사 자료나 초기 제안을 현재 제품 계약으로 취급하지 않는다.

| 문서 | 역할과 읽을 때 |
| --- | --- |
| [docs/glossary.md](docs/glossary.md) | 용어·엔티티·관계를 다룰 때: 정의와 개념 구분. |
| [docs/architecture.md](docs/architecture.md) | 기능·서비스 경계를 다룰 때: 구성·호출 흐름·현재 구현과 미결정 범위. |
| [docs/repository-structure.md](docs/repository-structure.md) | 파일·패키지 추가·이동 전: 코드 배치와 app/package 분리 기준. |
| [docs/project-records.md](docs/project-records.md) | 모든 변경에 적용하는 승인·Issue·Project·ADR 기록 규약. |
| [docs/data-storage.md](docs/data-storage.md) | 저장·초기화 작업의 진입점: 데이터 위치·수명·보존/삭제 범위. |
| [docs/ui-design.md](docs/ui-design.md) | 화면·상호작용 변경 전: 조립 순서·공개 부품·예제·검증 기준. |
| [docs/adr/](docs/adr/) | 장기 결정의 이유. 관련 결정의 상태·대체 관계·적용 범위를 확인한다. |
| [docs/paseo-adapter-initial-design.md](docs/paseo-adapter-initial-design.md) | **참고:** 초기 Adapter 제안이며 현재 채택 범위·구현의 원본이 아니다. |
| [docs/paseo-cli-capabilities.md](docs/paseo-cli-capabilities.md) | **참고:** 특정 버전의 CLI 조사. 적용 버전의 지원 여부는 재확인한다. |

브랜딩은 [지원 범위·입력 계약](packages/branding/README.md), 개발 환경은 [CLI 안내](apps/cli/README.md), 실연동은 [검증 데이터 격리](apps/paseo-dev/README.md#검증-데이터-격리)를 읽는다. 표에 없는 주제는 관련 README와 문서 링크를 따라 찾는다.

## 핵심 경계와 안전

- **제품 호출:** 앱 → Core → Runtime → Adapter를 따른다. Runtime은 계약이며 별도 서버가 아니다. 앱 시작 코드는 Adapter를 생성해 Core에 주입하고 제품 처리 코드는 Core API를 사용한다. Core에 Paseo SDK나 UI 책임을 넣지 않는다.
- **개발 환경:** 로컬 실행 관리는 앱 계층과 Node 전용 `packages/dev-environment`가 맡는다. 이 라이브러리의 SDK·supervisor 사용은 허용하되 제품 Core·Runtime·Adapter에서 가져오지 않는다. [ADR 0005](docs/adr/0005-local-development-cli-boundary.md)를 따른다.
- **브랜딩:** 빌드 시 표시 계층에만 적용한다. 공통 브랜드 정의를 사용하며 CLI 명령·환경 변수 접두사·패키지/API/내부 식별자를 바꾸지 않는다. 브랜드명에서 데이터 경로·서버 ID·인증 정보를 유도하지 않는다.
- **Daemon 제어:** 대상·소유권·다른 작업에 대한 영향을 확인한 전용 개발 환경만 제어한다. 개인용·다른 세션의 Daemon을 임의로 중단하지 않으며 포트나 PID만 보고 종료하지 않는다.
- **데이터와 작업 폴더:** 사용자·실행 데이터는 저장소 밖의 전용 루트를 사용하며 checkout과 서로 중첩하지 않는다. 다른 checkout의 기존 데이터를 연결하지 않는다. 새 Agent의 작업 폴더는 사용자가 명시하고 제품 저장소를 자동 입력하지 않는다. checkout·데이터·Agent 폴더는 공백 없는 ASCII 절대경로를 사용한다. `WORKNARU_DATA_DIR`·기본값·상세 문자 제한은 [저장 위치 설정](apps/paseo-dev/README.md#저장-위치-설정), 구현은 [공통 경로 해석](packages/dev-environment/paths.mjs)을 따른다.
- **초기화:** 개발 단계의 저장 구조 변경에는 마이그레이션을 도입하지 않는다. 정상 재시작은 데이터를 보존한다. 승인된 초기화는 정지·소유권·경로 확인 후 `pnpm exec worknaru dev reset --dry-run`으로 검토하고, `--dry-run`을 빼고 `--yes`로 실행한다. 실제 작업 프로젝트·제품 소스·개인 Paseo·Provider 로그인 정보는 삭제하지 않는다. [CLI 초기화](apps/cli/README.md#사용자-데이터-전체-초기화)와 [ADR 0011](docs/adr/0011-external-data-and-development-reset.md)을 따른다.

## 개발과 검증

[package.json](package.json)의 `packageManager`에 지정된 pnpm을 사용한다. 환경·의존성·최초 Agent 설정은 CLI 안내를 따른다. 실행이 필요한 경우 저장소 루트에서 진행한다.

```powershell
pnpm exec worknaru doctor
pnpm exec worknaru dev start
pnpm exec worknaru status
pnpm exec worknaru dev stop
```

| 변경·검증 대상 | 실행 기준 |
| --- | --- |
| 지침·일반 문서만 변경 | 링크·앵커·명령 존재·정책 일치와 `git diff --check`를 확인하고 기존 CI를 따른다. 문서 수정만을 이유로 Daemon 실행·데이터 초기화·Provider 호출을 하지 않는다. |
| 특정 기능 수정·로컬 결과 전달 | 변경 동작과 영향받는 호출부의 빌드·타입·관련 테스트를 선택한다. 수정을 묶어서 검증하며 매 수정마다 전체 검사를 반복하지 않는다. |
| 공통 계약·의존성·빌드 설정 변경 | 전체 빌드·자동 테스트인 `pnpm test`로 확대한다. 저장·권한·실행 수명 변경은 관련 회귀 테스트와 필요한 실연동도 선택한다. |
| UI·상호작용 변경 | [UI 검증 선택](docs/ui-design.md#실행과-검증)에 따라 해당 화면의 동작·키보드·접근성과 필요한 화면 크기를 확인한다. 공통 부품·토큰·전역 배치는 전체 UI 회귀로 확대한다. |
| 실행기·Adapter·실제 Agent 연동 영향 | 격리 안내에 따라 `pnpm dev:verify`, `pnpm paseo:verify`, `pnpm agent:verify`, `pnpm ui:live` 중 영향받는 검증을 선택한다. |
| 병합 완료 | 최종 변경에 대한 `pnpm test`와 UI 영향 시 전체 `pnpm ui:verify`, 필요한 실연동 및 실제 필수 CI 조건을 충족한다. 일반 문서 전용 변경은 경량 검증을 적용한다. 같은 변경·환경·범위를 포함한 로컬/CI 성공 근거를 재사용한다. |

실연동은 저장소 밖의 실행별 데이터·작업 fixture와 테스트 전용 `WORKNARU_TEST_ROOT`를 사용한다. 미지정 시의 경로는 격리 안내를 따른다. 소유권·영향을 확인한 관리형 개발 환경을 먼저 종료하고, 고정 포트를 쓰는 검증은 안내된 순서로 직렬 실행한다. 실제 Provider를 쓰는 검증은 설치·로그인·사용량 조건을 확인한다.

검증 선택 시 변경 영향·실행할 검사·확대 조건을 짧게 밝힌다. 명령·옵션은 현재 `package.json`과 관련 README에서 확인하며 존재하지 않는 선택 실행 명령을 가정하지 않는다. 필요한 선행 빌드를 생략해 오래된 `dist`를 검사하지 않는다. 좁은 실행을 지원하지 않으면 해당 패키지의 기존 검사를 사용한다.

테스트 명령이 없거나 0건이면 검증 완료로 취급하지 않는다. `packages/runtime`은 Core의 타입/계약과 영향받는 Adapter·CLI·Web, `packages/ui`는 Web의 UI 테스트·Storybook 브라우저, `packages/dev-environment`는 영향받는 CLI·paseo-dev·Agent 서비스 테스트를 확인한다. 구체적인 실행은 [패키지별 검증 안내](apps/paseo-dev/README.md#검증-선택)를 따른다.

선택한 검증이 통과하고 구체적인 미해결 위험이 없으면 종료한다. 이후 관련 소스·의존성·빌드 설정·테스트 환경 변경, 새로운 실패 또는 미해결 위험이 생긴 범위만 재검증한다. 일반 문서 정리만 추가했다면 이미 성공한 실행 검증을 재사용한다. 같은 실패를 조건 변화 없이 반복하지 말고 원인을 확인한다. 시간 경과나 제한 시간 초과를 통과로 처리하지 않는다.

일반 문서 예외는 설명에만 적용한다. CI·lockfile·빌드 설정·테스트 fixture·기준 이미지는 해당 실행/회귀 검증을 촉발한다. CI에서 실행할 예정이라는 이유로 완료를 선언하지 않으며, CI가 수행하지 않는 실연동은 별도 근거가 필요하다. 검증만을 위해 요청 범위 밖의 PR·푸시를 추가하지 않는다. 결과는 실행 범위·명령·성공/실패·미실행 이유를 기존 Issue/PR에 간결히 기록한다. 별도 검증 장부·validator를 추가하지 않는다. [검증 결정](docs/adr/0014-scoped-development-verification.md)을 따른다.

## 문서 유지와 결과 기록

변경된 설명은 담당 문서에 통합한다. 루트에는 공통 행동 규칙·탐색 링크만 두고 상세 계약·사용법·검증은 담당 문서가 소유한다. 소스·자동 생성 값의 별도 원본을 만들지 않는다. 문서 경로·역할 변경 시 안내와 링크도 갱신한다.

코드와 유효한 문서가 충돌하면 차이·영향을 보고한다. 코드의 존재로 정책 변경을 추정하거나 범위 밖 코드를 문서에 맞춰 수정하지 않는다. 과거 ADR·Issue·PR의 결정 근거는 보존한다.

범위·완료 조건은 Issue 본문, 논의·검증은 Issue/PR, 진행 상태는 전용 Project의 `Status`, 장기 결정은 ADR에 둔다. 다른 문서·tracker에 복제하지 않으며 기록 체계 변경은 별도 제안한다. 승인·종료는 기록 규약을 따른다. 공개 기록에 자격증명·개인 자료·비공개 외부 자료 원문을 넣지 않는다.
