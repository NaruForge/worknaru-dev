# ADR 0017: Agent 요청별 업무 컨텍스트 snapshot

- 날짜: 2026-09-16
- 상태: Accepted
- 관련 작업: [#59](https://github.com/NaruForge/worknaru-dev/issues/59)
- 승인 근거: 사용자가 #59의 요청별 컨텍스트·공통 Resolver·저장/실행 연결 계획을 확인한 뒤 구현, PR 생성, 독립 Astra 리뷰와 병합까지 지시했다.

## Context

Module은 명시적인 업무 대상을 검증하지만 Agent 메시지는 Agent ID·텍스트만 가진다. System Agent 등 후속 실행 주체가 서로 다른 규칙으로 cwd·UI 선택에서 업무 맥락을 추정하지 않도록 공통 경계가 필요하다. Agent에는 여러 요청과 기존 대화가 이어지므로 Agent의 영구 업무 소속과 요청의 대상은 구분해야 한다.

## Decision

1. Runtime의 `ExecutionTarget`/`ExecutionContext`와 Core `createContextResolver`를 Agent와 Module이 공유한다. Project 입력은 Project ID만 받으며 Workspace는 서버에서 조회한다. 여분 필드나 모순된 조합은 자동 보정하지 않는다.
2. Agent 메시지 접수 시 컨텍스트를 한 번 해석해 `AgentRequest.context`에 저장하고 Driver에 전달한다. 대기열 dispatch·정상 재시작은 이 snapshot을 사용한다. 같은 요청 ID의 재접수는 원래 대상을 대조하고 기존 기록을 반환한다. 입력·출력·Driver 사이에는 독립된 값 또는 불변 객체를 전달한다.
3. 이전 API 호출의 target 생략만 standalone으로 해석한다. 신규 CLI/Web 호출은 명시적인 target을 보낸다. cwd·마지막 UI 선택·최근 업무를 참조하지 않는다. Agent 생성에 영구 소속을 추가하지 않는다.
4. 컨텍스트는 Worknaru 실행 메타데이터다. Paseo의 프롬프트·cwd·권한으로 변환하거나 SDK에 존재하지 않는 업무 필드를 보내지 않는다. 요청 ID로 실행 컨텍스트와 상태를 추적한다. 같은 Agent의 기존 대화는 계속 공유되며 업무별 대화 격리를 보장하지 않는다.
5. Agent 상태 문서 버전 2와 데이터 루트 버전 3을 사용한다. 예전 기록의 컨텍스트를 추정해 마이그레이션하지 않는다. 기존 루트는 reset_required로 거부하고 실제 초기화는 별도의 명시적 작업이다.

## Consequences

일반 Agent와 후속 System Agent가 같은 업무 맥락 검증을 사용할 수 있다. 잘못된 대상은 접수·Provider 메시지 전송 전에 거부한다. 실행 시점에 재해석하는 방식과 달리 대기·재시도 뒤에도 접수 당시 대상이 유지된다. 향후 Project 이동·삭제가 도입되면 snapshot 보존과 실행 자격 재검증 정책은 그 작업에서 별도로 결정해야 한다.

이 단계는 AI가 Project 자료를 자동 이해하게 만들지 않는다. 파일 수집·권한 상속·프롬프트 렌더링·System Agent·대화 격리는 후속 기능이며 이번 Resolver에 포함하지 않는다. 기존 ADR 0008·0015·0016의 실행/업무 계약은 유지한다.
