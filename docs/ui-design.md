# Worknaru UI 표준

현재 제품 UI와 앞으로의 Module·Workspace 관리 화면은 공통 부품을 조립한다. 사용자 Module 자체의 화면 생성은 별도 설계 대상이다. [채택 근거](adr/0009-ui-design-system.md)와 [공개 UI 사용법](../packages/ui/README.md)을 참고한다.

## 화면을 만드는 순서

1. 사용자가 할 일과 정상·빈 상태·로딩·오류·권한 대기 상태를 정리한다.
2. [공개 타입과 구현](../packages/ui/src/index.tsx), [부품 예제](../packages/ui/src/UI.stories.tsx), [패널 예제](../packages/ui/src/Panel.stories.tsx), [Agent 화면](../apps/web/src/features/agents/Agents.stories.tsx)과 [통합 설정 예제](../apps/web/src/shell/Shell.stories.tsx)를 찾는다.
3. `@worknaru/ui`에서 가져온 부품과 패턴에 데이터·명시적인 callback을 연결한다. 도메인 호출은 Web 기능에서 Core API로 수행한다.
4. 관련 Storybook 상태와 사용자 동작 검증을 갱신한다. `pnpm test`, `pnpm ui:verify`를 실행한다.

단일 기능의 데이터·문구·실행 정책은 앱에 둔다. UI 패키지는 Core·Runtime·Paseo를 import하지 않는다. 버튼에 operation 문자열을 넘겨 제품 실행을 처리하는 범용 API를 만들지 않는다.

## 시각과 동작

Linear의 중립적인 바탕과 정보 위계, Paseo·VS Code의 탐색/작업 영역 분리를 참고한다. 사용자가 선택한 B안에 따라 앱 전체 탐색(Agent·설정), 현재 기능의 목록, 중앙 작업, 선택적 상세 정보의 책임을 분리한다. 생성은 중앙 입력 창이다. 작은 화면에서는 앱 탐색을 위에 두고 목록과 대화를 전환한다. 기능이 없는 미래 메뉴를 만들지 않는다. [App Shell 결정](adr/0010-app-shell-and-work-context.md)을 따른다.

실제 디자인 값의 원본은 [CSS 토큰](../packages/ui/src/tokens.css)이다. 색상·간격·서체·크기·모서리·그림자·움직임은 여기에서 읽는다. 다른 문서·JSON·Figma에 값을 수동 복제하지 않는다. 브랜드의 강조색과 글자색은 기존 branding 패키지가 주입한다. 상태 색상은 브랜드와 독립적이다.

밝게/어둡게/시스템 테마를 제공하며 최초에는 시스템 설정을 따른다. 브라우저의 `worknaru.ui.theme`은 화면 명도 선호만 저장한다. 서버 설정이나 실행 중 브랜드 전환이 아니다. 시스템 서체를 사용하고 한글 본문·긴 경로·확대 사용을 검토한다.

다음 행동을 글자로 표시하고 아이콘만 사용하는 버튼에는 `label`을 제공한다. 색상만으로 상태를 전달하지 않는다. 접수·실행·완료·실패·결과 확인 필요를 구분한다. 권한 응답과 오류 복구를 상세 패널에만 숨기지 않는다. 보관은 실제 서버 미리보기를 확인한 뒤 실행한다.

## 조립과 확장

표준 부품과 기존 패턴을 사용한 조립은 자율적으로 진행한다. 새 부품/변형이 필요하면 기존 API로 표현할 수 없는 실제 사용처, 영향받는 화면, API·상태 예제·접근성 검증을 함께 PR에 제시한다. 중요한 배치나 사용 흐름을 사용자와 논의할 때에는 같은 데이터·화면 크기·테마의 A/B/C 시안을 최소 3개 제공하고 선택을 기록한다.

앱 전용 배치는 CSS Modules에서 공통 토큰으로 작성한다. 공통 컴포넌트 내부 경로 import, 내부 선택자 덮어쓰기, 임의 색상/길이/서체, inline style, `!important`를 사용하지 않는다. `0`, 비율, flex/grid의 무차원 값, 반응형 media query는 배치에 사용할 수 있다. `className`은 앱 소유 영역의 배치와 도메인 행 표현을 위한 것이며 공통 버튼의 내부 스타일을 바꾸는 통로가 아니다.

타입·ESLint·Stylelint가 잘못된 공개 API, 의존 경계, 원시 스타일 값 등 기계적으로 판정 가능한 위반을 검사한다. 모든 선택자 덮어쓰기나 사람의 이해도를 자동으로 증명하지는 않는다. 검사 예외·토큰·공개 API·기준 이미지의 변경 이유는 PR에서 드러내고 검토한다.

크기 조절은 `PanelGroup` 안에 `ResizablePanel`을 조립한다. 제품은 너비와 변경 callback만 전달하고, 공통 패널이 토큰의 제한·가용 공간·키보드·포인터 동작을 처리한다. 이 부품 내부의 숫자형 `--panel-size` 주입만 동적 스타일 계약으로 허용한다. 앱의 inline style 금지와 기존 검사는 유지한다. `width={null}`은 토큰 기본값이며 기본 너비를 앱 코드에 복제하지 않는다.

## 탐색과 작업 상태

[App](../apps/web/src/shell/App.tsx)은 현재 실행 환경의 세션을 소유한다. [View 모델](../apps/web/src/shell/navigation.ts)은 hash URL을 해석하고 사용자 이동만 브라우저 이력에 추가한다. `#/agents?list=active&agent=…`, `#/settings/appearance` 같은 주소를 사용하며 기존 `#AgentID`는 호환 변환한다. 잘못된 주소나 없는 Agent는 안내와 목록으로 복구한다. 폴링은 새 탐색 이력을 만들지 않는다. 임의 서버 경로 fallback이나 별도 라우터 라이브러리는 필요하지 않다.

[Agent 세션](../apps/web/src/features/agents/useAgentSession.ts)은 Agent별 초안·이력·대기열·불명확한 전송의 요청 ID·권한 답변을 화면 수명과 분리한다. 설정 화면을 열어도 Agent 화면과 세션을 유지한다. 다른 Agent로 이동할 때는 해당 Agent의 기록과 읽던 위치를 복원한다. 늦은 응답은 요청을 시작한 Agent에만 적용한다. 다시 읽은 이력의 epoch가 바뀌면 예전 위치를 복원하지 않고 안내한다. 실행 환경의 endpoint·target ID·예상 server ID가 바뀌면 임시 세션을 새로 만든다. 서버의 기록·실행 상태를 대체하는 저장소가 아니다.

초안·읽던 위치·미저장 공유 설정은 같은 탭의 화면 이동까지만 보존한다. 새로고침·탭 종료 뒤에는 서버 기록과 URL의 선택을 다시 조회한다. 대화 내용을 localStorage에 쓰지 않는다. 테마와 패널의 너비·접힘만 브라우저 선호에 저장하며, 잘못된 값은 기본값/허용 범위로 복구하고 저장 불가 시 현재 탭에서 사용한다. 설정의 **화면 → 배치 초기화**로 패널 선호를 초기화한다.

통합 설정은 **화면 / Agent 동작 / 연결**로 나눈다. 테마·배치는 로컬에 즉시 적용하고, 전송 방식은 기존 Core의 revision 검증을 거쳐 명시적으로 저장한다. 미저장 상태로 이동하면 편집 내용과 표시를 유지하며 새로고침·탭 종료에는 브라우저 경고를 요청한다. 충돌 시 재조회 또는 취소로 복구한다. 연결은 진단만 제공한다. 기능의 설정 바로가기도 같은 화면을 열며 편집 원본을 중복 구현하지 않는다.

## 실행과 검증

저장소 루트에서 `pnpm ui:storybook`으로 개발용 카탈로그를 연다. Storybook은 실제 부품과 실제 제품 화면에 고정 Core 데이터를 주입하며 Provider를 호출하지 않는다. 제품 배포에는 포함하지 않는다. 공개 API의 타입은 소스가 원본이고 예제는 같은 컴포넌트를 import한다. 별도 MCP는 필요하지 않다.

`pnpm test`는 빌드·타입·경계/스타일 검사·기존 Node 테스트·React 사용자 동작 테스트를 실행한다. `pnpm ui:verify`는 Storybook을 빌드하고 브라우저 흐름·axe·화면 비교를 수행한다. 브라우저가 없으면 `pnpm --filter @worknaru/web exec playwright install chromium`을 먼저 실행한다.

390/768/1440px와 밝은/어두운 테마를 확인한다. 화면 비교 기준 환경은 `mcr.microsoft.com/playwright:v1.63.0-noble` Linux 이미지다. Windows 실행은 기능·접근성을 검증하며 Linux 기준 이미지를 갱신하지 않는다. 기준 변경은 같은 이미지에서 `pnpm --filter @worknaru/web exec playwright test --update-snapshots`로 생성한 뒤 실제 diff를 검토한다. CI는 누락된 이미지를 자동 승인하지 않는다.

자동 접근성 검사와 함께 키보드 이동, 포커스 복귀, 한글 조합 Enter, 확대·터치 화면을 확인한다. 실제 Codex 연동은 격리된 데이터 루트에서 별도로 검증한다. AI 조립 평가는 동일 과제를 새 세션 3회에 제공하고 공개 부품 재사용, 없는 API, 임의 스타일, 검사 우회, 수정량을 기록한다. 업무별 결과는 PR/이슈에 연결한다.
