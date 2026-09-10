# Paseo Adapter

`@worknaru/runtime`의 `Runtime.getDaemonStatus()`를 구현한다. Paseo SDK의 타입·응답·오류는 이 패키지 내부에서 처리한다. Core에는 factory가 반환한 `Runtime`을 전달하며, 제품 CLI는 [ADR 0001](../../docs/adr/0001-runtime-interface-and-paseo-adapter.md)에 따라 Core를 호출한다.

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

`configuredServerId`는 별도로 확인해 설정한 대상 식별자다. 개발 환경에서는 `.local/paseo-dev/server-id`를 읽어 전달한다. Adapter는 파일이나 전역 Paseo 환경 변수를 읽지 않으며 기본 주소로 대체 접속하지 않는다. 조회된 서버 ID가 예상값과 다르면 상태 RPC 전에 반환한다.

`targetId`, `endpoint`, `expectedServerId`는 필수다. 주소는 `ws:` 또는 `wss:`의 절대 URL이며 사용자 정보, query, fragment를 허용하지 않는다. 비밀번호는 별도 `password` 옵션으로 전달한다. 잘못된 설정은 접속 전에 고정된 설명의 `TypeError` 또는 `RangeError`로 거절한다.

각 호출은 독립된 클라이언트를 사용하고 종료 시 연결을 정리한다. 자동 재접속은 꺼져 있다. `timeoutMs`는 연결과 상태 요청을 합친 제한 시간이며 기본값은 5초, 허용 범위는 정수 1~300000ms다. 반환 필드의 의미는 [Runtime 계약](../runtime/README.md)에 설명한다.

## 실패 판정

| `failure.code` | 판정 근거 |
| --- | --- |
| `connection_failed` | SDK가 알려진 연결·전송 실패를 보고함. 프로세스 종료 여부는 미확인 |
| `authentication_required` / `authentication_failed` | Daemon이 비밀번호 필요 또는 거절 응답을 보냄 |
| `timeout` | 조회 예산 또는 SDK의 연결·응답 대기 제한 시간을 초과함 |
| `target_mismatch` | handshake 또는 상태 응답의 서버 ID가 확인 대상과 다름 |
| `unsupported_version` | 확인된 버전이 검증한 `0.8.0-beta.1`과 다르거나 버전을 확인할 수 없음 |
| `invalid_response` | SDK의 응답 스키마 검증 실패 또는 handshake와 상태 응답의 버전 불일치 |
| `request_failed` | Daemon이 상태 요청에 RPC 오류를 반환함 |
| `cleanup_failed` | 조회용 SDK 클라이언트 정리 중 오류가 발생함 |
| `unknown` | 확인된 분류 근거가 없는 오류 |

`unsupported_version`은 이 Adapter에서 검증한 버전 범위의 제한이다. 다른 버전의 프로토콜이 반드시 호환되지 않는다는 판정은 아니다. 해석할 수 없는 handshake를 SDK가 무시한 경우에는 대기 시간 초과만 관찰될 수 있으며, 그 원인을 인증·호환성 문제로 추정하지 않는다.

서버 정보가 포함된 실패 결과에서도 `outcome`과 `failure`를 확인해야 한다. 원시 오류 문자열·스택·Provider 오류·서버의 파일 경로는 결과에 포함하지 않는다.

## 구현과 검증

`@getpaseo/client`는 `0.8.0-beta.1`로 고정했다. 이 버전의 공개 facade에는 Daemon 식별 정보와 상태 API가 없어 내부 `DaemonClient.getLastServerInfoMessage()`와 `getDaemonStatus()`를 사용한다. SDK 버전 변경 시 내부 경로와 오류 변환을 다시 검증해야 한다. Adapter는 Paseo CLI·서버 패키지·로컬 프로세스 조회에 의존하지 않는다.

저장소 루트의 `pnpm test`는 TypeScript 빌드 후 실제 SDK와 loopback WebSocket 응답 서버로 오류 변환·조회 전용 RPC·연결 정리를 검증한다. `pnpm paseo:verify`는 전용 Paseo Daemon을 사용해 정상 조회·ID 불일치·종료 후 연결 실패와 조회 전후 프로세스·세션 유지를 확인한다. [개발 환경 안내](../../apps/paseo-dev/README.md)를 참고한다.

작업 범위와 검증 근거는 [Issue #2](https://github.com/NaruForge/worknaru-dev/issues/2)에서 관리한다.
