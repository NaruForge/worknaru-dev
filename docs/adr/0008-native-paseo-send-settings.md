# 0008. 공통 전송 설정과 Paseo 기본 동작 사용

- 날짜: 2026-09-11
- 상태: Accepted
- 관련 Work Item: [#19](https://github.com/NaruForge/worknaru-dev/issues/19)
- 승인 근거: 사용자가 전송 방식을 설정에서만 선택하고 Paseo 기본 동작을 따르는 단순화안을 지시했다.
- 대체: [ADR 0006](0006-agent-lifecycle-and-durable-queue.md)의 전송 정책, [ADR 0007](0007-agent-api-and-paseo-compatibility-boundary.md)의 protocol/server 패치 유지 결정
- 구현: [Core 정책](../../packages/core/src/agent-service.mjs), [Driver](../../packages/paseo-adapter/src/agent-driver.mjs), [CLI](../../apps/cli/README.md), [Web](../../apps/web/README.md)

## Context

메시지마다 queue/steer를 고르고, steer 불가 시 기존 작업을 교체하지 않는 강화된 조건을 제공하면서 Paseo protocol/server 패치가 필요해졌다. 사용자는 기본 설정에 따른 전송과 기존 Paseo 동작을 선호하며 이 유지보수 비용을 줄이도록 지시했다. 설정 선택 위치만 바꾸는 것으로는 strict 조건이 없어지지 않으므로 전송 의미도 함께 단순화한다.

## Decision

전송 방식은 Worknaru CLI/Web이 공유하는 설정 한곳에서 queue 또는 steer로 선택한다. 기본값 queue는 유지한다. Web의 메시지별 선택기, CLI의 --queue/--steer와 공개 send 입력의 mode를 제거한다. 새 요청 접수 시 서버 설정을 읽고, 이미 접수된 대기와 동일 ID 재시도에는 소급 적용하지 않는다. 기존 데이터의 mode·추가 필드는 그대로 읽으며 데이터 이전은 하지 않는다.

Paseo 원래 send API를 사용한다. 대기열은 Core가 실행 중인 작업·권한·보관 상태를 확인하고 순서대로 일반 interrupt 모드로 전달한다. steer는 원래 steer 모드로 전달하며 미지원 시 현재 작업을 중단하고 새 요청을 시작하는 Paseo 동작을 수용한다. 이 경우 이전 턴의 취소와 새 요청의 실행·완료를 구분한다. 적용할 수 없는 추가 지시를 항상 거부한다는 보장은 제공하지 않는다.

idle_only/steer_only 전용 모드와 @getpaseo/protocol·@getpaseo/server 패치를 모두 제거한다. 대체 사설 프로토콜이나 서버 내부 전송 구현을 만들지 않는다. 기존 relay 브라우저 배포 경로 패치는 별개이며 유지한다.

명시적인 Agent 메서드와 도메인 경계, 지속 FIFO·권한·생성/전송 ID·불명확한 요청의 확인 절차·하위 Agent 보관·기록과 파일 보존은 유지한다. Module·Workspace는 별도 도메인 API를 사용한다. 같은 서비스 경유 CLI/Web 작업은 직렬화하지만 외부 Paseo 클라이언트가 같은 Agent를 동시에 변경할 때의 전송·보관 경쟁까지 보장하지 않는다.

## Consequences

전송 방식의 선택과 안내가 단순해지고 Paseo 업데이트에 자체 server/protocol 패치를 이식할 필요가 없다. 다만 버전에 고정된 SDK 변환과 실제 기본 동작의 호환성 검증은 계속 필요하다.

추가 지시는 기존 작업을 교체할 수 있다. Web 설정과 CLI 문서에 이 의미를 표시한다. 기존 메시지별 옵션을 쓰는 자동화는 공통 설정을 사용하도록 수정하고, 실행 중인 환경은 의존성 설치 후 dev stop/start로 새 코드와 패키지를 반영해야 한다. 탭도 새로고침해 이전 UI가 제거한 mode를 보내지 않도록 한다.

검증은 패치 없는 설치, 공개 입력·CLI의 override 거부, 설정 변경과 기존 대기/재시도 보존, 기본 steer 수락·교체, 이전 턴 취소와 새 요청 상태 분리, 실제 Codex 및 Web 생명주기를 포함한다.
