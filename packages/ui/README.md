# @worknaru/ui

Worknaru 제품 화면의 공통 부품과 배치. 설치되는 앱이 아니라 Web이 사용하는 내부 라이브러리다. [조립 규칙](../../docs/ui-design.md), [공개 타입](src/index.tsx), [실행 예제](src/UI.stories.tsx)가 진입점이다.

```tsx
import { Button, Inline, Stack, TextField } from "@worknaru/ui";

export function NameForm({ onSave }: { onSave: (name: string) => void }) {
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSave(String(new FormData(event.currentTarget).get("name")));
      }}
    >
      <Stack>
        <TextField name="name" label="이름" required />
        <Inline align="end">
          <Button type="submit">저장</Button>
        </Inline>
      </Stack>
    </form>
  );
}
```

## 부품 선택

| 목적      | 공개 부품                         | 사용 조건·예제                                                                                                           |
| --------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 행동·이동 | Button, IconButton, Link, Icon    | Button은 실제 행동, Link는 이동. 아이콘 버튼에는 label 필수. `Buttons` 예제                                              |
| 입력      | TextField, TextArea, Select       | label 필수. hint/error가 입력의 접근 가능한 설명으로 연결된다. 폼 제출·검증은 앱 책임. `Fields` 예제                     |
| 상태      | Badge, Alert, Loading, EmptyState | Badge는 상태 이름, Alert는 읽어야 할 변경, EmptyState는 다음 행동을 제공. `States` 예제                                  |
| 창·메뉴   | Dialog, ConfirmDialog, Menu       | 제목/설명, 제어되는 열림 상태, 명시적인 callback. busy 중 중복 행동/닫기 금지. 기본 포커스 복귀와 Escape. `Dialogs` 예제 |
| 배치      | Stack, Inline, ListDetail         | 세로·가로 조립, 목록/상세 전환. ListDetail은 navigation과 selected를 받으며 모바일에서 해당 영역만 표시                  |
| 패널 조절 | PanelGroup, ResizablePanel, normalizePanelWidth | 제품이 너비·열림 상태와 저장을 소유하고 공통 부품이 크기 제한·포인터·키보드를 담당. [공개 타입](src/ResizablePanel.tsx)과 [실행 예제](src/Panel.stories.tsx) |

API의 정확한 prop·허용 변형은 공개 TypeScript 타입에서 확인한다. 숫자·색상 값은 [tokens.css](src/tokens.css)에만 정의한다. Storybook은 실제 부품을 실행하며 별도의 복제 화면을 만들지 않는다.

`ResizablePanel`은 `PanelGroup`의 가용 너비에서 중앙 작업 공간을 남기고 크기를 제한한다. `side`는 시작/끝 패널을 정하며 `width={null}`은 해당 토큰의 기본값을 선택한다. 구분선에 접근 가능한 `label`을 제공한다. 방향키로 크기 조절, Home/End로 최솟값/최댓값을 선택할 수 있다. 접기/펼치기 버튼과 포커스 복귀는 실제 화면이 제공한다. 모바일에서는 너비 선호를 유지하면서 전체 폭으로 표시하고 구분선을 숨긴다.

동적 너비는 패널 내부에서 검증한 숫자형 CSS 변수 하나로만 전달한다. 이 계약은 앱의 임의 inline style이나 내부 스타일 덮어쓰기를 허용하지 않는다. UI 패키지는 localStorage나 화면 이동 상태를 소유하지 않는다.

## 확장과 접근성

복잡한 대화상자·메뉴 동작은 Radix, 아이콘은 Lucide를 이 패키지 내부에서 사용한다. 불필요한 HTML 속성 wrapper를 늘리지 않으며 실제 HTML 의미와 ref/접근성 속성을 보존한다. 제품별 Agent·Module·Workspace 정책은 받지 않는다.

새 공통 API에는 실제 사용처와 정상·비활성·오류 등 관련 상태 예제, 이름·역할·키보드·포커스 검증을 함께 추가한다. 버튼 색상을 바꾸기 위해 외부에서 내부 CSS를 덮어쓰거나 새 variant를 무제한 추가하지 않는다. 범용 callback 하나가 여러 제품 operation을 실행하도록 만들지 않는다.

React 19의 ref prop을 사용한다. 토큰 CSS는 앱에서 한 번 import하고, branding은 앱 빌드에서 주입한다. 패키지 build는 공개 타입을 검사하며 Web/Storybook이 같은 소스를 번들링한다. 아직 npm 배포·독립 JS 산출물·외부 테마 엔진은 제공하지 않는다.
