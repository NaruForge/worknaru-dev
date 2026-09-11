# Worknaru Runtime 계약

Core가 실행 기반에 요청하는 기능과 반환 형식을 정의한다. 현재 기능은 `Runtime.getDaemonStatus()`이며 외부 SDK 의존성이 없다. [ADR 0005](../../docs/adr/0005-local-development-cli-boundary.md)의 Runtime 경계에 해당한다.

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

`outcome`은 이번 조회 결과다. Agent 세션 상태나 향후 실행 요청의 성공을 보장하지 않는다. 이 계약은 Daemon이나 Agent를 생성·시작·재시작·중단하는 기능을 제공하지 않는다.

`RuntimeFailureCode`는 연결 실패, 인증 필요·실패, 시간 초과, 대상 불일치, 미검증 버전, 응답 오류, 요청 거절, 클라이언트 정리 실패와 확인 불가를 구분한다. 구체적인 판정 근거는 각 Adapter가 책임진다. 원시 SDK 오류나 인증 값은 반환하지 않는다.

실제 구현과 설정 예시는 [Paseo Adapter](../paseo-adapter/README.md)를 참고한다. 작업 범위와 검증 근거는 [Issue #2](https://github.com/NaruForge/worknaru-dev/issues/2)에 있다.
