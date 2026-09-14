# Worknaru 개발 환경 라이브러리

CLI와 Paseo 검증 앱이 공유하는 Node 전용 라이브러리다. 소스 `.mjs`로 제공하므로 CLI의 경로·설정 진단을 사전 빌드 없이 수행할 수 있다. Paseo 의존성이 필요한 `daemon.mjs`는 진단/시작 단계에서 늦게 불러온다.

| 모듈 | 책임 |
| --- | --- |
| [paths.mjs](paths.mjs) | 외부 단일 루트·ASCII 경로·실제 부모·저장소 중첩 검사, 잠금 안에서 디렉터리 준비·쓰기 검사 |
| [storage.mjs](storage.mjs) | 전용 루트 마커·저장 구조 버전·소유 checkout 검사, 공통 작업 잠금 |
| [testing.mjs](testing.mjs) | 테스트 전용 외부 실행 디렉터리 생성 |
| [config.mjs](config.mjs) | 고정 주소·버전·개발 설정과 읽기 전용 설정 비교 |
| [control.mjs](control.mjs) | 기존 Windows named pipe의 요청·응답과 실행기 소유권 대조. CLI와 서버 플러그인이 공유 |
| [daemon.mjs](daemon.mjs) | 고정 Paseo supervisor 실행, 소유권·준비 확인, 정상 종료와 자신의 자식 실패 정리 |
| [web-files.mjs](web-files.mjs) | 공개 웹 자산만 임시 폴더에 복사하고 자신의 폴더 정리 |

CLI 명령·출력·빌드·잠금·백그라운드 제어 채널은 [CLI 앱](../../apps/cli/README.md)이 담당한다. SDK 비교 검증과 터미널에 연결된 수동 웹 실행은 [paseo-dev 앱](../../apps/paseo-dev/README.md)이 담당한다. 이전 앱의 `paths.mjs`, `daemon.mjs`, `web-files.mjs`는 호환 re-export다.

`config.mjs`는 기본 설정과 `agent setup`이 활성화한 전용 Agent 플러그인 설정을 구분해 허용한다. 다른 설정은 충돌로 남긴다. 설정 백업·빌드·원자적 교체는 CLI의 `agent-setup.mjs`가 맡는다. Agent 기능이 켜지면 `daemon.mjs`는 자식에만 데이터 루트·소유 checkout을 전달하고 시작 시 플러그인 health까지 확인한다. `paths.mjs`의 `agentState`는 단일 루트 아래 SQLite 경로다. 실행 플러그인 앱만 이 경로를 사용하고 제품 Core·브라우저는 파일에 직접 접근하지 않는다.

Core·Runtime·제품 Adapter·브라우저 코드가 이 패키지를 가져오지 않는다. 제품 상태 조회는 Core → Runtime → Adapter를 유지하며 이 라이브러리는 로컬 개발 환경만 관리한다. [ADR 0005](../../docs/adr/0005-local-development-cli-boundary.md)

저장 루트와 입력 제한은 [저장 위치 설정](../../apps/paseo-dev/README.md#저장-위치-설정)을 따른다. 브랜드에서 경로를 유도하거나 기존 설정·서버 ID·인증 자료를 이전하지 않는다. 현재 Paseo CLI·SDK·서버 0.8.0의 내부 supervisor/종료 API를 사용하므로 버전 변경 때 `pnpm paseo:verify`와 `pnpm dev:verify`를 다시 실행한다.

`storage.mjs`는 구 데이터를 읽어 복구하지 않는다. 저장 구조가 다르면 초기화를 요구한다. 실제 삭제 계획·정지 검사·링크 및 worktree 정리는 [CLI reset](../../apps/cli/data-reset.mjs)이 맡는다. setup/start/reset은 같은 루트 잠금을 사용하고 초기화 실패 상태에서는 실행을 막는다. [ADR 0011](../../docs/adr/0011-external-data-and-development-reset.md)

Paseo 서버 플러그인은 공통 모듈을 패키지의 공개 경로로 가져온다. CommonJS 번들에는 원본 파일 URL이 없으므로 전용 실행기가 전달한 checkout을 사용한다. 일반 Node CLI 실행은 자신의 모듈 위치를 기준으로 checkout을 계산하며 이 내부 환경 변수를 제품 저장 설정으로 사용하지 않는다.

Web의 개발 데이터 관리 요청도 기존 제어 채널로 전달한다. 저장 위치 항목·폴더 열기·초기화 후 재시작 정책은 CLI 앱이 소유한다. Node 전용 `control` 모듈은 브라우저나 제품 Core/Runtime/Adapter에 포함하지 않는다. [ADR 0012](../../docs/adr/0012-settings-data-management.md)
