# Worknaru 용어집

Worknaru의 제품 계약과 현재 실행 기반을 이해하는 데 필요한 용어를 영어 이름순으로 정리한다. 한 행에 하나의 용어를 정의하며, 채택한 개념과 아직 구현하지 않은 API·저장 구조를 구분한다.

| 용어 | 정의 |
| --- | --- |
| **Agent** | 작업을 맡기고 응답을 확인하며 후속 대화를 이어가는 실행 대상이다. 하나의 Agent에서 여러 Request와 Turn이 이어질 수 있다. |
| **Agent Request (Request)** | Worknaru가 접수하고 상태를 추적하는 메시지 전송 요청이다. 접수 시 확정한 업무 컨텍스트 snapshot을 함께 보관한다. 접수 성공, 실행 완료, 결과 내용의 정확성은 각각 별개다. |
| **Agent Service** | Core 정책에 실행 Driver와 저장소를 연결해 Agent 요청과 지속 대기열을 처리하는 Worknaru 서비스다. 현재 Paseo 서버 플러그인으로 실행한다. |
| **Agent Session** | Agent가 대화 맥락을 유지하며 후속 작업을 이어가는 실행 세션을 가리킨다. 현재 별도의 Worknaru Session 엔티티나 API를 정의하지 않는다. |
| **Archive** | 영향 범위를 확인한 Agent와 하위 Agent의 진행 중인 작업을 중단하고 대기 요청을 취소한 뒤 보관하는 동작이다. 대화 기록과 작업 파일은 보존하며, 보관된 Agent에는 메시지를 보낼 수 없다. |
| **Cancel** | 아직 실행하지 않은 대기 Request를 취소하는 동작이다. 실행 중인 Turn을 중단하거나 기록을 영구 삭제하는 명령이 아니다. |
| **Connection** | CLI·Web·Agent Service의 클라이언트가 Paseo Daemon과 통신하는 연결이다. 연결·브라우저 탭·결과 관찰의 종료 자체가 Agent 작업의 종료를 뜻하지 않는다. |
| **Core** | Worknaru의 제품 API와 Agent 운영 정책을 제공하는 계층이다. 앱의 API 호출은 Runtime 계약을 사용하고, 서버에서 실행하는 정책에는 Driver와 저장소를 주입한다. |
| **Discard** | 결과가 불명확한 Request의 기록을 사용자가 확인한 뒤 자동 재실행을 포기하고 그 요청을 취소 상태로 표시하는 처리다. 작업 중단·되돌리기·성공 판정은 수행하지 않으며, 남은 대기열은 Resume로 별도 재개한다. |
| **Managed Agent** | Worknaru가 생성하고 관리 대상으로 식별하는 Agent다. 현재 제품 목록과 이름·ID 선택은 이 Agent들을 대상으로 한다. |
| **Model** | Provider가 Agent 실행에 사용하는 AI 모델이다. Agent 생성 시 해당 Provider에서 사용할 수 있는 모델을 선택한다. |
| **Module** | 특정 업무 기능을 제공하며 여러 업무에서 재사용할 수 있는 독립 기능 단위다. Workspace·Project는 이를 참조해 사용하며, 외부·로컬 서비스, AI Agent, 사용자 검수·수정을 필요한 만큼 구성할 수 있다. |
| **Module Execution Context** | Module Run의 업무 대상과 기록·결과의 논리적 귀속을 나타내는 실행 맥락이다. Standalone은 Workspace·Project 없이, Workspace는 선택한 공간에서, Project는 선택한 업무와 그 소속 Workspace에서 실행하며 파일 접근 권한·cwd는 별도로 정한다. |
| **Module Run** | Module을 특정 입력·설정·실행 맥락으로 수행하는 개별 실행이다. 기록이 남거나 실행이 반복된다는 사실만으로 Project가 되지 않는다. 현재 내장 Module 실행·상태/결과 저장·CLI 조회를 제공한다. |
| **Paseo Adapter** | Runtime 계약을 Paseo 호출로 구현하고, Paseo의 응답·오류·이벤트를 Worknaru가 사용하는 형태로 변환하는 계층이다. Agent Service가 사용하는 실행 Driver도 이 패키지에서 제공한다. |
| **Paseo Client** | Paseo Daemon에 연결해 요청을 보내고 응답과 이벤트를 받는 SDK다. Worknaru의 CLI나 Web UI 자체를 가리키지 않는다. |
| **Paseo Daemon** | Agent 실행·세션·기록 관리와 플러그인 호스팅 등을 제공하는 Paseo의 실행 서비스다. Worknaru 전용 인스턴스는 이 서비스를 별도로 실행한 것이며, 자체 개발한 별도 Daemon을 뜻하지 않는다. |
| **Paseo Plugin** | Paseo의 확장 API로 기능을 추가하는 플러그인이다. Agent Service를 실행하는 데 사용하며, Worknaru의 업무 기능인 Module과는 다른 개념이다. |
| **Paseo Project** | 저장소나 폴더 등의 개발 대상을 등록하고 그 아래 Paseo Workspace들을 묶는 단위다. Worknaru Project와는 별개의 개념이며 이름만으로 1:1 대응하지 않는다. |
| **Paseo Workspace** | Paseo Project에 속하며 작업 폴더를 기반으로 Agent·터미널·브라우저 등의 세션을 함께 사용하는 작업 공간이다. 기존 폴더나 Git worktree를 사용할 수 있으며, Worknaru Workspace와는 별개의 개념이다. |
| **Permission** | Agent 실행 중 필요한 권한 승인·거부나 사용자 질문에 대한 답변 요청이다. 권한·질문 대기는 작업 완료가 아니며 사용자의 응답이 필요하다. |
| **Provider** | AI 모델을 이용해 Agent를 실행하는 도구 또는 실행 제공자다. 현재 Worknaru의 Agent 기능은 Codex를 사용한다. |
| **Queue** | Worknaru가 Request를 저장하고 현재 Turn의 성공 등 실행 조건을 확인해 접수 순서대로 전달하는 기본 전송 방식이다. 권한 대기·실행 실패·Turn 취소·결과 미확정에서는 후속 대기를 보류하되, Steer가 기존 Turn을 교체한 경우 새 Request 처리는 계속한다. |
| **Resume** | 정지된 대기열에서 남은 대기 Request의 처리를 재개하는 동작이다. Uncertain 요청을 먼저 확인·처리해야 하며, 그 요청을 자동 재전송하는 기능은 아니다. |
| **Runtime** | Core가 실행 기반에 요구하는 기능과 반환 형식을 정의한 계약이다. 별도 서버나 프로세스를 뜻하지 않는다. |
| **Steer** | 진행 중인 Turn에 추가 지시를 전달하는 전송 방식이다. 현재 Paseo 기본 동작에서는 적용할 수 없으면 기존 Turn을 중단하고 전달받은 Request를 새 Turn에서 실행할 수 있다. |
| **System Agent** | 사용자가 업무를 시작하고 필요한 Module·Project·Workspace를 구성하도록 돕는 앱 수준의 안내·작업 진입점이다. 특정 Workspace·Project를 선행 조건으로 두지 않으며, 현재 이 역할의 전용 기능·세션·위임 구조는 구현하지 않았다. |
| **Turn** | 실행 기반이 시작과 종료를 보고하는 실행 단위다. Steer가 현재 Turn에 적용되면 여러 Request가 같은 Turn에 연결되므로 Request와 항상 1:1인 것은 아니다. |
| **Uncertain** | 전송 응답·연결·재시작 등의 문제로 Request의 실행 결과를 확정할 수 없는 상태다. 성공이나 실패로 추정하지 않고, 자동 재전송을 멈춰 기록과 현재 상태의 확인을 요구한다. |
| **Working Directory (작업 폴더)** | Agent가 작업하는 대상 Daemon 컴퓨터의 디렉터리(`cwd`)다. 브라우저가 실행되는 컴퓨터의 폴더나 Workspace 자체를 뜻하지 않는다. |
| **Worknaru Project** | 하나의 목표나 관리 대상에 관한 자료·대화·결과·결정을 축적하고, 후속 작업에서 다시 활용하도록 관리하는 업무 단위다. 정확히 하나의 Worknaru Workspace에 속하며, 기간·실행 횟수·기록 존재만으로 구분하지 않고 Git 저장소나 Agent cwd와도 구분한다. |
| **Worknaru Workspace** | 관련 Project를 담고, 함께 사용할 Module과 설정을 구성하는 업무 공간이다. Project를 조직하는 구조에서 최상위이며 앱 수준 Agent·단독 Module 실행의 필수 부모나 로컬 디렉터리를 뜻하지 않는다. |

Module·Worknaru Workspace·Worknaru Project의 정의와 관계는 채택한 제품 계약이다. Workspace·Project 생성·조회·저장과 CLI·Web 진입점, 내장 Module 실행·기록의 CLI 진입점은 구현했다. 수정·삭제·사용자 Module 설치·AI 실행과 Paseo 매핑은 후속 범위다. 구성·관계·실행 맥락과 현재 구현의 차이는 [개념 아키텍처](architecture.md#제품-개념과-현재-구현의-관계), 선택 이유는 [ADR 0015](adr/0015-workspace-project-module-contract.md)에 둔다.

현재 입력·결과는 [Runtime 계약](../packages/runtime/README.md), 전송 정책의 결정 근거는 [ADR 0008](adr/0008-native-paseo-send-settings.md)에 있다. 실제 명령과 화면 사용법은 [CLI 안내](../apps/cli/README.md)와 [Web UI 안내](../apps/web/README.md)를 참고한다. Paseo Project·Workspace의 기본 의미는 [Paseo 공식 Workspace 설명](https://paseo.sh/docs/workspaces.md)을 따른다.
