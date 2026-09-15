# ADR 0009: 조립 중심 제품 UI 디자인 시스템

- 날짜: 2026-09-14
- 상태: Superseded — [ADR 0013](0013-windows-ui-verification.md)이 Linux 화면 비교 환경에 한해 대체하며 나머지 UI 결정은 유지한다.
- 관련 작업: [#23](https://github.com/NaruForge/worknaru-dev/issues/23)
- 승인 근거: 사용자가 디자인 시스템 v1 계획의 전체 구현과 PR·독립 리뷰·병합을 명시적으로 승인함.

## Context

기존 Agent Web은 TypeScript의 수동 DOM 갱신과 화면별 CSS를 사용했다. 다음 제품 화면을 확장하기 전에 사람이 이해하기 쉬운 공통 표현과 AI가 조립할 수 있는 실행 예제·검사 경계가 필요하다. DOM 유지, 대형 완성형 UI 제품, 범용 스키마 렌더러와 공통 컴포넌트 조립을 비교했다.

## Decision

React/React DOM·TypeScript·Vite를 Web에 사용하고 공통 UI를 `packages/ui`에 둔다. Radix는 복잡한 상호작용, Lucide는 아이콘을 담당한다. CSS Modules는 영향 범위를 제한하고 CSS 변수 파일이 디자인 값의 원본이다. 기존 branding 입력을 의미별 토큰에 연결한다.

UI는 표시 데이터·명시적인 callback을 받으며 Core/Runtime/Paseo를 import하지 않는다. 제품별 화면과 데이터 조회는 Web 앱에 둔다. 서버가 요청 실행 상태의 원본이며 React 상태에는 현재 화면의 조회 결과와 초안·선택·열림 상태만 둔다. 새 범용 RPC·전역 상태 프레임워크·JSON 화면 엔진은 도입하지 않는다.

Storybook은 실제 컴포넌트와 화면을 실행하는 개발 전용 카탈로그다. TypeScript·ESLint·Stylelint, Vitest/RTL, Playwright/axe·화면 비교로 조립과 회귀를 검증한다. AI는 짧은 안내에서 공개 타입과 관련 예제로 이동한다. MCP/Figma는 필수 원본이나 의존성이 아니다.

왼쪽 목록·중앙 대화·선택적 상세 정보와 중앙 생성 창을 사용한다. 테마 선호는 브라우저 개인 설정이며 실행 중 브랜드 전환이 아니다. 현재 제품 UI 전체를 이전하고 미래 Module/Workspace 기능과 사용자 Module UI 생성은 범위에서 제외한다.

Daemon 정적 배포의 flat 파일 계약과 Core → Runtime → Adapter를 유지한다. Vite 서버를 관리형 개발 실행에 추가하지 않는다. 프로토콜/서버 소스를 UI 요구 때문에 patch하지 않는다. Paseo 호스트의 기존 React 19.1.9 peer를 해당 호스트 패키지에 명시하여 Web의 React 19.3과 독립적으로 해석한다.

## Consequences

공통 상태·예제·검사와 다음 화면의 조립 방식이 연결된다. 초기 React 이전 비용, 개발 의존성과 공통 API 관리 비용이 늘어난다. Radix나 자동 접근성 검사만으로 제품 사용성을 보장하지 않으므로 실제 사용자 흐름·키보드·한글 입력을 별도로 확인한다.

정적 배포는 기존 SDK를 포함한 단일 JS 번들을 유지하므로 코드 분할을 사용할 수 없다. 이를 바꾸려면 별도 정적 자산 계약의 변경 근거가 필요하다. 화면 비교는 고정된 Linux/브라우저 환경에 한정하며 Windows 픽셀 결과와 동일하다고 가정하지 않는다. 검사 예외와 기준 이미지는 PR에서 검토한다.

구현과 검증 근거는 연결된 작업의 PR에 남기며 진행 상태를 이 문서에 복제하지 않는다.

채택 시 화면 비교: [이전 UI](../assets/ui-v1-before.png)와 [v1 UI](../assets/ui-v1-after.png). 같은 고정 대화 데이터·Windows Chromium·1440×900 viewport로 캡처했으며 이전 UI는 전체 페이지가 viewport보다 길다. 이전 화면은 `d155d91`의 HTML/CSS/화면 코드를 사용했다. 이 이미지는 결정 시점의 비교 자료이며 회귀 검사용 Linux 기준 이미지는 Web 브라우저 테스트가 소유한다.
