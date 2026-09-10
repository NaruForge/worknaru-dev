# 0003. CLI와 브라우저에서 Core·Adapter 공통 사용

- 날짜: 2026-09-10
- 상태: Accepted
- 승인 근거: CLI와 Web UI가 Core·Adapter를 공통으로 사용하고 브라우저에서 Paseo Daemon에 연결하는 구조 및 호환 작업을 설명한 대화에서, 사용자가 “좋습니다. web ui를 고려한 아키텍쳐 문서 업데이트가 필요하겠네요”라고 요청했다.
- 관련 Work Item: [Web UI를 고려한 아키텍처 문서 업데이트 #7](https://github.com/NaruForge/worknaru-dev/issues/7), [첫 웹 상태 조회 구현 #9](https://github.com/NaruForge/worknaru-dev/issues/9).
- 관련 결정: [ADR 0001](0001-runtime-interface-and-paseo-adapter.md)의 Runtime 의존 경계를 유지하며 앱의 실행 위치를 정한다.
- 현재 구현 링크: [Core](../../packages/core/src/index.ts), [Runtime](../../packages/runtime/src/index.ts), [Paseo Adapter](../../packages/paseo-adapter/src/index.ts), [CLI 시작 코드](../../apps/cli/src/bootstrap.ts), [웹 시작 코드](../../apps/web/src/bootstrap.ts).

## Context

현재 Worknaru CLI는 시작 코드에서 Paseo Adapter를 만들고 Core에 주입한다. Core·Adapter·Paseo Client는 CLI 프로세스 안에서 동작하며, Client가 별도 Paseo Daemon과 통신한다.

Web UI를 추가하려면 Core·Adapter를 웹 서버에서 실행하고 화면이 HTTP API로 호출할지, 브라우저 안에서 실행하고 Daemon에 직접 연결할지 실행 위치를 정해야 한다. 기존 Core·Runtime 경계는 특정 실행 위치를 요구하지 않는다.

Paseo 자체도 CLI와 웹이 같은 Client를 사용하고 환경에 맞는 WebSocket 구현을 선택한다. 이 구조를 활용하면 Worknaru의 공통 API와 실행 기반 연동을 유지하면서 웹 화면을 추가할 수 있다. 결정 당시 Adapter와 고정한 의존 패키지에는 브라우저 적용을 위한 조정·검증이 남아 있었다.

## Decision

- CLI와 Web UI는 같은 Worknaru Core API와 Runtime 계약, Paseo Adapter 코드를 사용한다. 앱 시작 코드가 Adapter를 구성해 Core에 주입하고, 명령·화면 처리는 Core API를 호출한다.
- CLI에서는 Core·Adapter·Paseo Client를 Node.js 프로세스 안에서 실행한다. Web UI에서는 브라우저 안에서 실행하고 Client가 Paseo Daemon에 WebSocket으로 직접 연결한다.
- 공통 라이브러리를 각 앱에서 인스턴스화한다. CLI와 웹 사이의 메모리·연결 공유를 전제하지 않는다.
- Core·Runtime은 CLI·브라우저에 공통인 계약을 유지한다. Paseo SDK 의존성과 환경별 통신 대응은 Adapter 경계 안에서 처리하고, 명령·화면·설정 입력은 각 앱이 담당한다.
- 이 연결 경로에는 별도 Worknaru API 서버를 필수로 두지 않는다. Web UI의 정적 파일 제공 방식은 별도로 선택한다.
- 현재 상태 조회 계약을 웹에서도 재사용한다. Module·Workspace의 저장 구조, 지속 연결·세션 정책, 다중 사용자 기능과 배포 구성은 이 결정에서 확정하지 않는다.

## Consequences

- CLI와 Web UI가 Worknaru API, Paseo 응답·오류 변환과 대상 확인 로직을 재사용할 수 있다.
- 브라우저에서 불러올 공통 코드의 환경 의존성을 관리해야 한다. Node.js 전용 기능과 의존 패키지의 브라우저 빌드를 조정하고, 실제 브라우저 연결과 기존 CLI 동작을 모두 검증한다.
- 웹 앱은 브라우저에서 사용할 접속 설정을 전달하고, 배포 시 브라우저가 대상 Daemon에 연결할 수 있는 주소·인증 구성을 마련해야 한다.
- 공통 코드 사용만으로 CLI와 웹의 업무 데이터가 동기화되지는 않는다. 제품의 저장·공유 모델은 별도 설계가 필요하다.
- Agent 실행과 파일 작업은 Daemon이 있는 환경에서 수행한다. 클라이언트 연결의 수명과 Agent 작업의 수명을 구분한다.

구성도와 현재 구현 범위는 [개념 아키텍처](../architecture.md)에서 설명한다. 참고 소스는 Paseo의 [CLI 연결 구성](https://github.com/getpaseo/paseo/blob/7bcf167862ce9bb040007d1469c77c00928a84c8/packages/cli/src/utils/client.ts), [웹 연결 구성](https://github.com/getpaseo/paseo/blob/7bcf167862ce9bb040007d1469c77c00928a84c8/packages/app/src/runtime/websocket-factory.web.ts)이다.
