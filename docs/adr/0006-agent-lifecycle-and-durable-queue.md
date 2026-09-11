# 0006. Agent 생명주기와 Daemon 소유의 지속 대기열

- 날짜: 2026-09-11
- 상태: Superseded
- 대체 결정: [ADR 0008](0008-native-paseo-send-settings.md). 메시지별 선택과 strict 전송·패치 정책을 대체하며 지속 대기열·권한·보관 결정은 유지한다. 아래 내용은 당시 결정의 기록이다.
- 관련 Work Item: [#17](https://github.com/NaruForge/worknaru-dev/issues/17)
- 승인 근거: 사용자가 생성 → 조회 → 메시지 전송 → 응답 확인 → 후속 대화 → 보관, 사람이 쉽게 쓰는 CLI/Web과 문서 갱신 계획의 구현 및 PR 작성을 지시했다.
- 구현: [Core 정책](../../packages/core/src/agent-service.mjs), [실행 앱](../../apps/agent-service/README.md), [Adapter](../../packages/paseo-adapter/README.md)

## Context

상태 조회만으로는 사용자가 Agent에게 작업을 맡기고 결과를 이어서 활용할 수 없다. CLI와 Web이 별도 메모리 대기열을 가지면 탭·프로세스 종료 후 대기가 사라지고 동시 전송 순서가 달라진다. Paseo 0.8.0의 기존 steer는 불가할 때 작업 교체로 바뀔 수 있어 사용자의 추가 지시 의도와 맞지 않는다.

## Decision

첫 Provider는 Codex로 제한하고 실제 모델 목록·존재하는 작업 폴더로 Agent를 생성한다. CLI와 Web은 [ADR 0005](0005-local-development-cli-boundary.md)의 Core → Runtime → Adapter를 유지한다. 앱 안의 Core API 인스턴스는 공유하지 않으며 상태를 Daemon 쪽에서 공유한다.

전용 Daemon에 신뢰된 서버 플러그인 `apps/agent-service`를 로드한다. 앱이 SQLite·수명·폴더 검증을 담당하고 Core가 주입된 저장소·Driver 위에서 생성 멱등성, FIFO, 실패 정지, 권한·보관 정책을 실행한다. SDK와 Provider의 자료 변환은 Adapter에 둔다. 별도 HTTP API 서버는 추가하지 않는다.

기본 전송 방식은 영속 `queue`이며 성공한 턴 뒤에만 다음 메시지를 실행한다. CLI/Web 공통 설정과 요청별 override를 제공한다. `steer`는 현재 턴의 명시적 수락만 성공으로 취급하며 불가·턴 교체 경쟁에서 현재 작업을 대신 중단하지 않는다. 이를 위해 고정된 protocol/server에 안전한 admission 모드를 패치한다. 일반 Paseo의 기존 모드는 유지한다.

대기열과 생성 요청 ID는 단일 데이터 루트의 SQLite에 원자적으로 저장하고, Agent별 직렬 처리·DB revision으로 여러 클라이언트 및 오래된 Worker를 조정한다. 실행 결과를 확정할 수 없을 때 exactly-once 완료를 주장하지 않고 `uncertain`으로 멈춘다. 자동 재전송 없이 사용자가 기록을 확인하고 취소 처리한 뒤 남은 대기를 재개한다.

권한 승인·거부·질문 답변은 사용자 선택만 전달한다. 보관은 하위 Agent·진행 중인 작업·대기열의 최신 영향을 확인하고, 확인 토큰과 다시 대조한 뒤 실행 자원을 정리한다. 파일·대화는 보존하고 보관된 Agent에 대한 전송과 자동 복구는 금지한다. 하위 Agent는 같은 보관 잠금 그룹에서 처리한다.

setup은 정지된 관리형 환경에서 기존 기본 설정을 백업하고 전용 플러그인을 활성화한다. 사용자 변경 설정·개인용 Paseo·인증은 덮어쓰지 않는다. 기능 준비 확인과 현재 Daemon 상태 조회는 구분한다.

## Consequences

CLI·탭을 닫아도 Daemon이 대기를 실행하고, 재시작 뒤 접수된 대기와 설정을 복구할 수 있다. 불명확한 요청은 사람이 확인해야 하므로 무인 자동 재실행보다 보수적인 복구 절차가 필요하다. SQLite 쓰기 실패 시 기능을 멈추며 데이터를 임의로 초기화하지 않는다.

서버 플러그인·내부 DaemonClient·protocol/server 패치와 Node.js 24 SQLite를 유지보수해야 한다. Paseo 버전 변경 시 명시적 이벤트 구독, 턴 ID·타임라인 교체, steer 경쟁과 보관 후 전송 거부를 실제 Provider로 다시 검증한다. Module·Worknaru Workspace 도메인, 다른 Provider, 첨부파일, 영구 삭제·복원, 원격 배포와 OS 서비스는 이 결정의 범위 밖이다.
