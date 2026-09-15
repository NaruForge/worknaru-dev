# ADR 0013: Windows 전용 제품의 UI 검증을 Windows로 통일

- 날짜: 2026-09-15
- 상태: Superseded — [ADR 0014](0014-scoped-development-verification.md)가 일반 문서 전용 PR/push의 CI 실행 범위에 한해 대체하며 Windows 환경·기준 이미지·실패 처리 결정은 유지한다.
- 관련 작업: [#42](https://github.com/NaruForge/worknaru-dev/issues/42)
- 승인 근거: 사용자가 Windows 전용 프로젝트에서 Linux 검증의 필요성을 재검토하도록 지시한 뒤 Windows 전환·기준 이미지 교체·독립 리뷰·병합 계획을 승인했다.
- 대체 범위: [ADR 0009](0009-ui-design-system.md)의 고정 Linux 화면 비교 환경. React·공통 UI·Storybook·정적 검사·접근성·실연동·기준 이미지 검토 등 나머지 결정은 유지한다.
- 구현: [CI](../../.github/workflows/ui.yml), [Playwright 설정](../../apps/web/playwright.config.ts), [브라우저 테스트](../../apps/web/test/browser).

## Context

제품 실행과 실제 Daemon·초기화 검증은 Windows를 대상으로 한다. 기존 브라우저 기능 검증은 Windows에서도 실행했지만 화면 비교는 Linux에서만 수행했다. 이 분리는 로컬 Docker 준비와 별도 빌드·검증을 요구하고 실제 Windows 글꼴의 화면 비교를 누락했다. 환경을 일정하게 맞출 필요는 있으나 Linux를 추가 지원할 제품 요구는 없다.

## Decision

기존 CI의 tests/browser 병렬 작업을 Windows 2025로 통일한다. Node·pnpm은 기존 고정 버전을 유지하고 Chromium은 잠금 파일의 Playwright가 지정한 버전을 설치한다. 브라우저 테스트는 Windows에서만 실행하며 기능·키보드·접근성·화면 비교를 모두 유지한다. Linux 전용 분기·기준 이미지·Docker 설정을 제거한다.

화면 기준은 Windows CI에서 캡처한 PNG를 검토해 커밋한다. 같은 환경에서 기준 갱신 없이 재실행해 비교를 확인한다. 정상 실행은 기준 누락과 불일치를 실패로 처리하고 자동 갱신하지 않는다. 화면 비교의 soft assertion은 나머지 캡처·동작까지 진단하도록 계속 실행할 뿐 최종 실패를 통과로 바꾸지 않는다. 기존 workflow의 명시적 수동 실행에서만 후보 생성을 선택할 수 있다. 생성 결과는 검토용 artifact로 제공하며 자동 커밋하지 않는다. 일반 PR/push 검증과 기존 보고서·actual/expected/diff·trace artifact는 유지하며 별도 생성 서비스나 workflow는 추가하지 않는다.

Windows runner 라벨은 OS 계열을 지정하며 공급자의 이미지 업데이트까지 고정하지 않는다. 이미지 버전·OS·제품 폰트 해시를 CI 로그에 남겨 생성·비교 환경을 대조한다. 로컬 Windows와 CI의 차이는 환경과 화면을 확인하며 허용 오차 확대나 무조건적인 기준 덮어쓰기로 처리하지 않는다. 제품 폰트·스타일·Daemon 동작은 변경하지 않는다.

## Consequences

개발자는 Docker 없이 기존 pnpm 명령으로 UI를 검증한다. Windows에서 실제 사용하는 글꼴과 화면을 비교하며 기존 테스트 범위를 유지한다. 전환 시 기준 이미지를 새로 검토하는 비용이 들고 이후 Windows 이미지 업데이트로 화면 차이가 생길 수 있다. CI는 Chromium 설치 비용이 추가되므로 속도 개선을 미리 보장하지 않으며 준비·테스트 시간을 실제 실행 결과로 비교한다.

명령·기준 갱신·환경 차이 처리의 원본은 [UI 표준](../ui-design.md#실행과-검증)이다. 검증·시간 비교·리뷰 근거는 연결한 Issue/PR에 남긴다.
