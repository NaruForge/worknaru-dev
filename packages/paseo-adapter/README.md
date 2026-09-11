# Paseo Adapter

`@worknaru/runtime`의 `Runtime.getDaemonStatus()`를 구현한다. Paseo SDK의 타입·응답·오류는 이 패키지 내부에서 처리한다. Core에는 factory가 반환한 `Runtime`을 전달하며, 제품 CLI와 Web UI는 [ADR 0005](../../docs/adr/0005-local-development-cli-boundary.md)에 따라 Core를 호출한다.

## 사용

```typescript
import { createPaseoRuntime } from '@worknaru/paseo-adapter';

const runtime = createPaseoRuntime({
  targetId: 'worknaru-dev',
  endpoint: 'ws://127.0.0.1:6868/ws',
  expectedServerId: configuredServerId,
  timeoutMs: 5000,
  // password: configuredPassword,
});

const status = await runtime.getDaemonStatus();
if (status.outcome === 'available') {
  console.log(status.server);
} else {
  console.log(status.failure.code);
}
```

`configuredServerId`는 별도로 확인해 설정한 대상 식별자다. 개발 실행기는 [선택한 데이터 루트](../../apps/paseo-dev/README.md#저장-위치-설정)의 `server-id`를 읽어 전달한다. 기본 위치는 `.local/paseo-dev/server-id`다. Adapter는 브랜드·경로 설정, 파일이나 전역 Paseo 환경 변수를 읽지 않으며 기본 주소로 대체 접속하지 않는다. 조회된 서버 ID가 예상값과 다르면 상태 RPC 전에 반환한다.

개발 실행기는 기본값을 포함한 데이터 루트의 폴더명을 영문·숫자·`-_.`로 제한한다. 브랜드 링크의 ASCII 입력 제한도 앱의 빌드 계약이며 Adapter의 접속 주소·식별자 계약을 변경하지 않는다.

`targetId`, `endpoint`, `expectedServerId`는 필수다. 주소는 `ws:` 또는 `wss:`의 절대 URL이며 사용자 정보, query, fragment를 허용하지 않는다. 비밀번호는 별도 `password` 옵션으로 전달한다. 잘못된 설정은 접속 전에 고정된 설명의 `TypeError` 또는 `RangeError`로 거절한다.

`clientType`은 `'cli'` 또는 `'browser'`이며 기본값은 `'cli'`다. 웹 앱의 시작 코드가 `'browser'`를 전달한다. 연결 ID 생성에는 Node.js와 브라우저의 `globalThis.crypto.randomUUID()`를 사용하고, 통신에는 각 환경의 표준 WebSocket을 사용한다. 브라우저 실행은 localhost 또는 HTTPS 환경을 전제로 한다.

상태 호출은 독립된 클라이언트를 사용하고 종료 시 연결을 정리한다. 자동 재접속은 꺼져 있다. `timeoutMs`는 연결과 상태 요청을 합친 제한 시간이며 기본값은 5초, 허용 범위는 정수 1~300000ms다. 반환 필드의 의미는 [Runtime 계약](../runtime/README.md)에 설명한다.

## Agent RPC와 실행 Driver

앱은 `Runtime.agents.create()`·`send()` 등 명시적인 메서드를 통해 전용 플러그인의 `agents.execute` RPC를 호출한다. [agent-rpc.ts](src/agent-rpc.ts)는 매 호출에서 서버 ID·0.8.0 버전을 확인한 뒤 Worknaru 결과·오류를 반환하고 연결을 닫는다. `timeoutMs`는 이 경로의 연결 제한이며 RPC는 SDK의 응답 제한을 따른다. 승인된 요청 뒤 연결 정리 오류 때문에 자동 재전송을 유도하지 않는다. 원시 SDK 예외는 제품 오류로 변환한다.

서버 플러그인이 사용하는 별도 Node 전용 export `@worknaru/paseo-adapter/agent-driver`는 Codex 모델 조회·생성·목록·타임라인·전송·권한·보관을 SDK에 연결한다. 이 export는 브라우저에서 가져오지 않는다. Worker 연결은 재접속하고 이벤트를 관찰하며, 연결 손실·타임라인 교체는 Core 정책에 알린다. 재접속 이후에도 대상 ID·버전을 확인한다. 권한 완료 이벤트는 0.8.0의 명시적 이벤트 구독에 등록해야 `respondToPermissionAndWait`의 결과를 받을 수 있다.

타임라인의 `seqStart`를 Worknaru 순서 번호로 매핑하고 `epoch`·이전 페이지 cursor·clientMessageId·turnId를 전달한다. Provider의 턴 ID는 재시작 뒤 재사용될 수 있으므로 특정 요청 결과는 사용자 메시지 ID 이후 범위로 확인한다. 작업 폴더 후보는 부모 경로 기준 SDK 조회 결과를 절대경로로 변환한다.

Paseo 기본 전송 API를 사용하며 protocol/server 패치는 없다. Core가 idle 상태와 권한·보관 상태를 확인한 뒤 대기 메시지를 일반 `interrupt` 모드로 전달한다. 추가 지시는 원래 `steer` 모드로 전달하며, Provider가 적용하지 못하면 Paseo가 진행 중인 작업을 교체할 수 있다. 별도 strict 전송이나 원자적 idle-only 조건을 덧붙이지 않는다.

설치된 원본 프로토콜과 기본 steer의 수락·교체는 [전송 계약 테스트](../../apps/paseo-dev/test/agent-sending.test.mjs)로 확인한다. 버전 변경 시 이 테스트와 실제 Codex 전송·권한·보관을 다시 검증한다. 결정은 [ADR 0008](../../docs/adr/0008-native-paseo-send-settings.md), 검증 근거는 [Issue #19](https://github.com/NaruForge/worknaru-dev/issues/19)에 둔다.

## 실패 판정

| `failure.code` | 판정 근거 |
| --- | --- |
| `connection_failed` | SDK가 알려진 연결·전송 실패를 보고함. 프로세스 종료 여부는 미확인 |
| `authentication_required` / `authentication_failed` | Daemon이 비밀번호 필요 또는 거절 응답을 보냄 |
| `timeout` | 조회 예산 또는 SDK의 연결·응답 대기 제한 시간을 초과함 |
| `target_mismatch` | handshake 또는 상태 응답의 서버 ID가 확인 대상과 다름 |
| `unsupported_version` | 확인된 버전이 검증한 `0.8.0`과 다르거나 버전을 확인할 수 없음 |
| `invalid_response` | SDK의 응답 스키마 검증 실패 또는 handshake와 상태 응답의 버전 불일치 |
| `request_failed` | Daemon이 상태 요청에 RPC 오류를 반환함 |
| `cleanup_failed` | 조회용 SDK 클라이언트 정리 중 오류가 발생함 |
| `unknown` | 확인된 분류 근거가 없는 오류 |

`unsupported_version`은 이 Adapter에서 검증한 버전 범위의 제한이다. 다른 버전의 프로토콜이 반드시 호환되지 않는다는 판정은 아니다. 해석할 수 없는 handshake를 SDK가 무시한 경우에는 대기 시간 초과만 관찰될 수 있으며, 그 원인을 인증·호환성 문제로 추정하지 않는다.

서버 정보가 포함된 실패 결과에서도 `outcome`과 `failure`를 확인해야 한다. 원시 오류 문자열·스택·Provider 오류·서버의 파일 경로는 결과에 포함하지 않는다.

## 구현과 검증

### Paseo 호환성 패치의 책임과 제거 조건

Agent 전송용 protocol/server 패치는 제거했다. 현재 남은 패치는 아래 relay의 브라우저 배포 경로 수정뿐이다. 지원 버전은 0.8.0으로 유지하며 업그레이드 시 SDK 변환·연결·기본 전송의 실제 동작을 검증한다. 자체 strict 전송 모드의 패치 이식은 필요하지 않다. 이전 선택과 변경 근거는 [ADR 0008](../../docs/adr/0008-native-paseo-send-settings.md)에 있다.

같은 Agent를 외부 Paseo 클라이언트가 동시에 조작할 때 Core의 조회와 네이티브 전송 사이에 상태가 바뀔 수 있다. CLI/Web의 서비스 내부 직렬화는 유지하지만 외부 전송·보관까지 원자적으로 조정한다고 보장하지 않는다.

`@getpaseo/client`는 정식 버전 `0.8.0`으로 고정했다. 이 버전의 공개 facade에는 Daemon 식별 정보와 상태 API가 없어 내부 `DaemonClient.getLastServerInfoMessage()`와 `getDaemonStatus()`를 사용한다. SDK 버전 변경 시 내부 경로와 오류 변환을 다시 검증해야 한다. Adapter는 Paseo CLI·서버 패키지·로컬 프로세스 조회에 의존하지 않는다.

같은 SDK의 연결 시간 초과 처리에서 사용하는 WebSocket 종료 코드 `1001`은 Node의 표준 WebSocket이 거부한다. [조회용 WebSocket factory](src/status-websocket.ts)는 해당 코드만 `1000`으로 바꿔 연결이 남는 문제를 막는다. 조회용 소켓에만 적용하며 전역 WebSocket이나 SDK 파일을 수정하지 않는다. SDK 자체 연결 타이머가 먼저 만료되는 경로도 별도 회귀 테스트로 검사한다. 이 수정의 근거는 [Issue #4](https://github.com/NaruForge/worknaru-dev/issues/4)에 연결한다.

고정된 `@getpaseo/relay@0.8.0`의 `./e2ee` export는 브라우저 빌드 시 배포에 없는 `src/e2ee.ts`를 가리킨다. [pnpm 패치](patches/@getpaseo__relay@0.8.0.patch)는 이 경로의 `import`·`default`만 실제 배포된 `dist/e2ee.js`로 변경한다. Node 경로와 라이브러리 코드는 유지한다. [pnpm workspace](../../pnpm-workspace.yaml)와 lockfile이 패치를 적용하므로 브라우저 앱에 Paseo 전용 경로 alias가 필요하지 않다. 버전 업데이트 시 이 패치의 필요성을 다시 확인한다.

저장소 루트의 `pnpm test`는 TypeScript 빌드 후 실제 SDK와 loopback WebSocket 응답 서버로 오류 변환·조회 전용 RPC·연결 정리를 검증한다. `pnpm paseo:verify`는 전용 Paseo Daemon을 사용해 정상 조회·ID 불일치·종료 후 연결 실패와 조회 전후 프로세스·세션 유지를 확인한다. [개발 환경 안내](../../apps/paseo-dev/README.md)를 참고한다.

작업 범위와 검증 근거는 [Issue #2](https://github.com/NaruForge/worknaru-dev/issues/2)에서 관리한다.

브라우저 적용과 실제 Web UI 조회·오류·시간 초과·소켓 정리 검증은 [Issue #9](https://github.com/NaruForge/worknaru-dev/issues/9)에 연결한다. 실행 방법은 [Web UI 안내](../../apps/web/README.md)를 참고한다.

정식 버전 전환과 위 두 호환 대응의 유지 근거·재검증은 [Issue #11](https://github.com/NaruForge/worknaru-dev/issues/11)에 연결한다.
