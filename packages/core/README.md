# Worknaru Core

앱에서 호출하는 Worknaru API다. 현재 `createWorknaruCore({ runtime })`가 제공하는 기능은 `getDaemonStatus()`이며, 주입받은 [Runtime 계약](../runtime/README.md)에 상태 조회를 요청하고 그 결과를 반환한다.

```typescript
import { createWorknaruCore } from '@worknaru/core';

// runtime은 앱의 시작 코드에서 구성해 전달한다.
const core = createWorknaruCore({ runtime });
const status = await core.getDaemonStatus();
```

Core는 Paseo SDK, 구체적인 Adapter, 명령행 옵션, 환경 변수와 출력 형식을 알지 못한다. 앱의 시작 코드가 Runtime 구현을 선택하고, [CLI 명령 처리](../../apps/cli/src/cli.ts)와 [웹 화면](../../apps/web/src/main.ts)은 같은 Core API를 호출한다. 현재는 상태 조회를 전달하는 얇은 API이며 Module·Workspace 정책이나 별도 상태 저장소는 추가하지 않았다.

의존 경계는 [ADR 0001](../../docs/adr/0001-runtime-interface-and-paseo-adapter.md), 작업 범위와 검증 근거는 [Issue #4](https://github.com/NaruForge/worknaru-dev/issues/4)를 따른다.
