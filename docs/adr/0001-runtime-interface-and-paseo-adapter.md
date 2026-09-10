# 0001. Runtime 인터페이스와 Paseo Adapter를 통한 실행 기반 분리

- 날짜: 2026-09-10
- 상태: Accepted
- 승인 근거: 이 결정의 배경·결정·결과를 제안한 대화에서 사용자가 "승인함"으로 명시적으로 승인했다.
- 관련 Work Item: [Daemon 상태 조회 구현 #2](https://github.com/NaruForge/worknaru-dev/issues/2).
- 구현 링크: [Runtime 계약](../../packages/runtime/src/index.ts), [Paseo Adapter](../../packages/paseo-adapter/src/index.ts).

## Context

Worknaru는 에이전트 세션 관리와 heartbeat 등의 실행 기능을 Paseo에서 재사용하면서, Module과 Workspace를 중심으로 한 업무 기능과 전용 CLI를 개발한다.

CLI와 업무 로직이 Paseo의 구체적인 API에 직접 의존하면 Paseo 변경이나 향후 실행 기반 교체의 영향이 제품 전체로 퍼진다. 실행 기반에 대한 의존 경계를 정한다.

## Decision

- Worknaru CLI는 Worknaru Core API만 호출한다.
- Core는 Worknaru가 정의한 Runtime 인터페이스에 의존한다.
- 초기 실행 기반은 Paseo를 사용하며, Paseo Adapter가 Runtime 인터페이스를 구현한다.
- Paseo SDK와 필요한 daemon API 호출, Paseo 고유의 타입·응답 처리는 Adapter 내부에 둔다. Core와 CLI에는 Worknaru가 정의한 계약으로 상태·결과·오류·이벤트를 전달한다.
- Runtime 인터페이스는 실제 필요한 기능부터 정의한다. 구체적인 패키지 구성, heartbeat 호출 방식, daemon 배포 방식은 후속 검증에서 정한다.

## Consequences

- Paseo의 변경이 CLI와 업무 로직에 미치는 영향을 줄인다. 다른 실행 기반이 같은 Runtime 계약을 구현하면 CLI 변경을 최소화하며 교체할 수 있다.
- Adapter 구현과 Runtime 계약을 유지하고, Paseo의 동작을 해당 계약으로 올바르게 전달하는지 검증할 책임이 생긴다.
- 이 결정은 실행 기반의 교체 가능성을 확보하며, 자체 daemon 개발을 결정하지는 않는다.
