# 0007. Agent 공개 API와 Paseo 호환성 계층의 경계

- 날짜: 2026-09-11
- 상태: Superseded
- 대체 결정: [ADR 0008](0008-native-paseo-send-settings.md). protocol/server 패치 유지 결정을 대체하며 명시적인 Agent API와 도메인 경계는 유지한다. 아래 내용은 당시 결정의 기록이다.
- 관련 Work Item: [#17](https://github.com/NaruForge/worknaru-dev/issues/17), [PR #18](https://github.com/NaruForge/worknaru-dev/pull/18)
- 승인 근거: 사용자가 독립 리뷰·지적 대응·병합을 지시했고, 서버·프로토콜 패치의 기술부채와 범용 Agent RPC의 도메인 확장 위험을 추가로 지적했다. 승인된 기능을 유지하면서 공개 API와 호환성 책임을 제한한다.
- 구현: [AgentAPI](../../packages/runtime/src/agents.ts), [RPC Adapter](../../packages/paseo-adapter/src/agent-rpc.ts), [서버 바인딩](../../apps/agent-service/index.server.ts)

## Context

`agents(operation, input)`을 제품 공개 API로 두면 Module·Workspace까지 문자열 명령을 늘리기 쉽다. 타입이 있는 operation map만으로 도메인 경계가 명확해지는 것은 아니다.

[ADR 0006](0006-agent-lifecycle-and-durable-queue.md)의 안전한 queue·steer를 구현하려면 Paseo 0.8.0의 서버 admission 보강이 필요하다. 공개 SDK의 기존 steer는 미지원 시 현재 작업 교체로 이어지며, 안전한 내부 AgentManager 메서드는 플러그인 공개 API에 없다. 클라이언트의 사전 조회와 잠금만으로 외부 실행과의 경쟁을 막을 수 없다.

## Decision

Core·Runtime은 `agents.create()`·`send()`·`history()` 등 명시적인 Agent 메서드만 공개한다. 공개 operation dispatcher와 operation map은 제거한다. Core 정책 서비스 역시 명시적 메서드로만 호출한다. `{operation, input}`은 Adapter와 플러그인 통신 바인딩 내부에 두고 허용 Agent operation을 고정 enum으로 검증한다. Module·Workspace는 별도 API를 정의하며 이 RPC를 만능 통로로 확장하지 않는다.

protocol/server 패치는 Paseo 0.8.0 전용 호환성 계층으로 함께 유지하고 `packages/paseo-adapter`가 책임진다. 새 enum은 미패치 프로토콜에서 거부되므로 기존 steer로 fallback하지 않는다. protocol만 제거하고 기존 enum의 의미를 바꾸는 안은 미패치 서버에 안전하지 않아 채택하지 않는다. Provider 직접 구현도 이번 범위에서 채택하지 않는다.

Paseo의 공식 idle-only·strict steer가 같은 안전 검증을 통과할 때 두 패치를 공식 API로 대체한다. 버전 변경 시 수행할 검증과 제거 조건은 [Adapter 유지보수 절차](../../packages/paseo-adapter/README.md#paseo-호환성-패치의-책임과-제거-조건)를 따른다. ADR 0006의 지속 대기열·권한·보관 결정은 그대로 유지한다.

## Consequences

앱과 후속 도메인은 Agent 작업의 이름·입력·결과를 직접 사용한다. 새 기능에는 명시적인 도메인 API 변경이 필요하며, 전송 형식이 제품 인터페이스가 되지 않는다.

서버·프로토콜 호환성 부채는 남는다. Paseo 업데이트는 단순 Adapter 변환 수정으로 끝나지 않으며 설치된 guard와 실제 Provider 검증이 필요하다. 이를 문서만으로 제거했다고 주장하지 않는다.
