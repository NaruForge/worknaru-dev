# Worknaru Core

앱에서 호출하는 Worknaru API와 Agent 운영 정책이다. `createWorknaruCore({ runtime })`는 `getDaemonStatus()`와 Agent 전용 메서드 객체 `agents`을 주입받은 [Runtime 계약](../runtime/README.md)에 전달한다.

```typescript
import { createWorknaruCore } from '@worknaru/core';

// runtime은 앱의 시작 코드에서 구성해 전달한다.
const core = createWorknaruCore({ runtime });
const status = await core.getDaemonStatus();
const agents = await core.agents.list({});
const request = await core.agents.send({
  agent: agents[0].id, id: crypto.randomUUID(), text: '작업을 설명해 주세요.', mode: 'queue',
});
```

Core는 Paseo SDK, 구체적인 Adapter, 명령행 옵션, 환경 변수와 화면을 알지 못한다. CLI와 브라우저의 시작 코드가 Runtime 구현을 선택한다. `conversationMessages`는 응답 조각을 합쳐 두 앱에 같은 대화 표시 규칙을 제공한다.

`agents`는 Agent 도메인에 한정된 명시적인 메서드 집합이다. 공개 `execute(operation, input)`이나 임의 문자열 dispatcher를 제공하지 않는다. 향후 Module·Workspace는 별도 도메인 API를 정의하고 필요한 Agent 메서드를 조합한다. 자세한 경계는 [ADR 0007](../../docs/adr/0007-agent-api-and-paseo-compatibility-boundary.md)을 따른다.

Node 실행부는 별도 export `@worknaru/core/agent-service`의 `createAgentService({ driver, store, validateDirectory })`를 사용한다. [Agent 플러그인 앱](../../apps/agent-service/README.md)이 저장소·폴더 검증과 [실행 Driver](../paseo-adapter/src/agent-driver.mjs)를 주입한다. Core 정책은 이름·ID 해석, 생성/전송 멱등성, FIFO, 권한 대기, 실패 시 정지, 보관 영향 확인을 담당한다. 저장 파일이나 DB 구현을 직접 가져오지 않는다. 브라우저 빌드에 실행부나 SQLite를 포함하지 않는다.

설정과 요청은 저장 성공 후에만 실행한다. Agent별 직렬 처리와 여러 Agent의 보관 잠금으로 동시 요청을 조정한다. 수신 확인이 불명확한 요청을 자동 재전송하지 않는다. 보관은 확인 토큰의 영향 범위와 현재 상태를 다시 대조한다. Module·Worknaru Workspace 정책은 후속 범위다.

의존 경계는 [ADR 0005](../../docs/adr/0005-local-development-cli-boundary.md), 지속 실행 정책은 [ADR 0006](../../docs/adr/0006-agent-lifecycle-and-durable-queue.md)을 따른다. 정책 테스트는 [service.test.mjs](../../apps/agent-service/test/service.test.mjs), 작업·검증 근거는 [Issue #17](https://github.com/NaruForge/worknaru-dev/issues/17)에 있다.
