# Worknaru Runtime 계약

Core가 실행 기반에 요청하는 기능과 반환 형식을 정의한다. `Runtime.getDaemonStatus()`와 Agent 작업 계약이 있으며 외부 SDK 의존성이 없다. [ADR 0005](../../docs/adr/0005-local-development-cli-boundary.md)의 Runtime 경계를 유지한다.

## Daemon 상태 조회

`getDaemonStatus()`는 설정된 대상에 대한 `DaemonStatus`를 반환한다.

| 필드 | 의미 |
| --- | --- |
| `target` | 호출자가 정한 대상 ID, 자격증명이 없는 접속 주소, 예상 서버 ID |
| `checkedAt` | 결과와 연결 상태를 관찰한 ISO 8601 시각 |
| `outcome` | `available`: 대상·버전을 확인하고 상태 응답을 받음. `unavailable`: 이번 조회에서 사용 가능 여부를 확인하지 못함 |
| `connection` | 조회용 클라이언트를 정리하기 전의 연결 상태. 반환 후 유지되는 연결을 뜻하지 않음 |
| `server` | 서버에서 확인한 ID·버전. 연결 이후 조회가 실패해도 확인한 값은 보존하며, 미확인 값은 `null` |
| `localProcess` | 현재는 항상 `unknown`. 연결 실패로 로컬 프로세스 종료를 추정하지 않음 |
| `failure` | 성공 시 `null`. 실패 시 Worknaru의 `code`, 발생 `stage`, 안전한 설명 `message` |

`outcome`은 이번 조회 결과다. Agent 세션 상태나 향후 실행 요청의 성공을 보장하지 않는다. 상태 조회 자체는 실행 대상을 변경하지 않는다.

`RuntimeFailureCode`는 연결 실패, 인증 필요·실패, 시간 초과, 대상 불일치, 미검증 버전, 응답 오류, 요청 거절, 클라이언트 정리 실패와 확인 불가를 구분한다. 구체적인 판정 근거는 각 Adapter가 책임진다. 원시 SDK 오류나 인증 값은 반환하지 않는다.

실제 구현과 설정 예시는 [Paseo Adapter](../paseo-adapter/README.md)를 참고한다. 작업 범위와 검증 근거는 [Issue #2](https://github.com/NaruForge/worknaru-dev/issues/2)에 있다.

## Agent 작업

[agents.ts](src/agents.ts)의 `AgentAPI`가 `agents.create()`·`send()`·`history()` 등 메서드별 입력과 결과를 정의한다. 임의 operation 문자열이나 다른 도메인의 명령을 실행하는 공개 통로는 없다. 상태 조회만 구현한 기존 Runtime에서는 Agent 메서드를 생략할 수 있으며 Core가 `feature_unavailable`로 알린다.

| 작업 | 계약 |
| --- | --- |
| `health`, `options`, `directories` | 실행부 준비, Codex 모델·기본 폴더, 디렉터리 후보 |
| `create`, `list`, `show` | 멱등 생성, 활성/보관 목록, 이름·ID로 선택한 Agent 상태·권한 |
| `history` | 순서 번호·턴·메시지 ID와 텍스트, 이전 페이지 cursor·epoch |
| `send`, `requests` | 영속 접수와 실행 상태. 접수는 완료를 의미하지 않음 |
| `cancel`, `resume`, `discard` | 대기 메시지 취소, 남은 대기열 재개, 불명확한 요청의 실행 포기 |
| `permission` | 현재 요청의 승인·거부·action·질문 답변 전달 |
| `archivePreview`, `archive` | 하위 Agent·대기열을 포함한 영향 확인 토큰과 실제 보관 결과 |
| `settings`, `saveSettings` | CLI/Web 공통 전송 기본값과 낙관적 revision 검사 |

전송 방식은 공통 `settings`의 `queue`와 `steer`다. `send` 입력은 Agent·요청 ID·메시지만 받으며 요청별 mode를 받지 않는다. 응답의 `mode`는 접수된 실행 방식을 나타낸다. 설정 변경은 접수된 대기에 소급하지 않는다. steer는 Paseo 기본 동작을 따르며 미지원 시 기존 작업을 교체할 수 있다. 요청 상태는 `queued → sending → running → completed`이며 `failed`, `canceled`, `uncertain`도 별도로 표현한다. 성공한 턴 뒤에만 다음 대기를 실행한다. 재시작·통신 장애로 확정하지 못한 요청은 `uncertain`으로 남기며 자동 재전송하지 않는다. `discard`는 이를 사용자 확인으로 취소 처리하는 동작이며 완료나 Provider 실행 중단을 뜻하지 않는다.

실패는 안전한 `AgentError(code, message)`로 전달한다. 대상·버전 불일치, 입력 오류, 모호한 이름, 권한 만료, 추가 지시 접수 보류, 미리보기 변경·만료, 저장 오류와 실행 결과 불명확을 구분한다. 질문 답변은 `{ answers: { [header]: string } }`를 permission 입력의 `answers`에 넣는다. 모든 경로는 대상 Daemon 기준이다. 자세한 운영 의미는 [ADR 0008](../../docs/adr/0008-native-paseo-send-settings.md)을 따른다.
