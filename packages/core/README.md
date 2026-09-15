# Worknaru Core

앱에서 호출하는 Worknaru API와 Agent 운영 정책이다. `createWorknaruCore({ runtime })`는 `getDaemonStatus()`와 Agent 전용 메서드 객체 `agents`를 주입받은 [Runtime 계약](../runtime/README.md)에 전달한다.

```typescript
import { createWorknaruCore } from '@worknaru/core';

// runtime은 앱의 시작 코드에서 구성해 전달한다.
const core = createWorknaruCore({ runtime });
const status = await core.getDaemonStatus();
const agents = await core.agents.list({});
const request = await core.agents.send({
  agent: agents[0].id, id: crypto.randomUUID(), text: '작업을 설명해 주세요.',
});
```

Core는 Paseo SDK, 구체적인 Adapter, 명령행 옵션, 환경 변수와 화면을 알지 못한다. CLI와 브라우저의 시작 코드가 Runtime 구현을 선택한다. `conversationMessages`는 응답 조각을 합쳐 두 앱에 같은 대화 표시 규칙을 제공한다.

`agents`는 Agent 도메인에 한정된 명시적인 메서드 집합이다. 공개 `execute(operation, input)`이나 임의 문자열 dispatcher를 제공하지 않는다. Workspace·Project는 아래의 독립 도메인 API를 사용한다. 향후 Module도 별도 도메인 API를 정의하고 필요한 Agent 메서드를 조합한다. 자세한 경계는 [ADR 0008](../../docs/adr/0008-native-paseo-send-settings.md)을 따른다.

Node 실행부는 별도 export `@worknaru/core/agent-service`의 `createAgentService({ driver, store, validateDirectory })`를 사용한다. [Agent 플러그인 앱](../../apps/agent-service/README.md)이 저장소·폴더 검증과 [실행 Driver](../paseo-adapter/src/agent-driver.mjs)를 주입한다. Core 정책은 이름·ID 해석, 생성/전송 멱등성, FIFO, 권한 대기, 실패 시 정지, 보관 영향 확인을 담당한다. 저장 파일이나 DB 구현을 직접 가져오지 않는다. 브라우저 빌드에 실행부나 SQLite를 포함하지 않는다.

설정과 요청은 저장 성공 후에만 실행한다. Agent별 직렬 처리와 여러 Agent의 보관 잠금으로 동시 요청을 조정한다. 수신 확인이 불명확한 요청을 자동 재전송하지 않는다. 보관은 확인 토큰의 영향 범위와 현재 상태를 다시 대조한다. Module·Workspace·Project의 [제품 계약](../../docs/architecture.md#제품-개념과-현재-구현의-관계)을 따른다. Workspace·Project 생성·조회는 아래 API가 처리하고, Module 실행·설정 및 수정·삭제 정책은 후속 범위다.

의존 경계는 [ADR 0005](../../docs/adr/0005-local-development-cli-boundary.md), 지속 실행 정책은 [ADR 0008](../../docs/adr/0008-native-paseo-send-settings.md)을 따른다. 정책 테스트는 [service.test.mjs](../../apps/agent-service/test/service.test.mjs), 작업·검증 근거는 [Issue #17](https://github.com/NaruForge/worknaru-dev/issues/17)에 있다.

## Workspace·Project 최소 도메인

`createWorkspaceDomain({ store })`는 `createWorknaruCore({ runtime })`와 별도로 사용하는 Core API다. 업무 메타데이터 저장에는 Agent나 Runtime을 요구하지 않는다. 앱이 `WorkspaceStore`를 주입하며 Core는 Node·SQLite·파일 경로를 import하지 않는다. 현재 Node 구성은 [서버 플러그인](../../apps/agent-service/README.md#workspaceproject-api)이 담당한다. 기존 `createWorknaruCore` 호출 계약은 바꾸지 않았다.

```typescript
import { createWorkspaceDomain, type WorkspaceStore } from '@worknaru/core';

// 앱의 시작 코드가 구현한 저장 포트를 받는다. 메모리 저장소를 자동 생성하지 않는다.
async function createExample(store: WorkspaceStore) {
  const domain = createWorkspaceDomain({ store });
  const workspace = await domain.createWorkspace({ name: 'Engineering' });
  const project = await domain.createProject({ workspaceId: workspace.id, name: 'Analysis' });
  return domain.getProject({ id: project.id });
}
```

| 메서드 | 입력 / 결과 |
| --- | --- |
| `createWorkspace` | `{ name }` → Workspace |
| `listWorkspaces` | 인자 없음 → Workspace 배열 |
| `getWorkspace` | `{ id }` → Workspace |
| `createProject` | `{ workspaceId, name }` → Project |
| `listProjects` | `{ workspaceId }` → 해당 소속의 Project 배열 |
| `getProject` | `{ id }` → Project. Workspace는 반환된 소속에서 확인 |

Workspace는 `{ id, name, createdAt }`, Project는 `{ id, workspaceId, name, createdAt }`다. 소문자 UUID와 UTC ISO 시각은 서비스가 생성한다. 이름은 앞뒤 공백을 제거하고 1~200 UTF-16 code unit으로 제한하며 제어 문자를 거부한다. 이름 중복은 허용하고 선택은 ID로 한다. 입력에 ID·시각·cwd·알 수 없는 필드를 추가할 수 없다. SQLite 목록은 `createdAt`, `id` 오름차순이다.

`WorkspaceDomainError.code`는 `invalid_input`, `workspace_not_found`, `project_not_found`, `storage_error`다. 없는 Workspace의 Project 목록은 빈 배열이 아니라 오류다. 저장 실패는 성공으로 반환하지 않고 SQL·경로 등 원시 오류를 노출하지 않는다. 반환 객체는 저장 객체와 분리한다. 저장 포트는 원자적 insert와 Project 외래키를 보장해야 한다.

생성 호출은 호출마다 새로운 ID를 만든다. 전송 결과가 불명확한 생성 요청을 자동 재시도하지 않는다. 삭제·이동·수정, Module/Run, Agent/cwd 연결, UI·CLI 명령과 원격 클라이언트 API는 이 최소 구현에 포함하지 않는다. 검증은 `pnpm test`가 타입·도메인·SQLite/재시작 테스트를 포함해 실행한다. [Issue #51](https://github.com/NaruForge/worknaru-dev/issues/51)
