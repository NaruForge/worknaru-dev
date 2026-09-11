# Paseo CLI 기능 참고

## 목적과 사용 범위

Worknaru에서 필요한 실행 기능을 고를 때 참고할 Paseo CLI 기능 목록이다. [ADR 0005](adr/0005-local-development-cli-boundary.md)에 따라 실제로 필요한 기능부터 Runtime 계약을 정의하고 Paseo Adapter에 추가한다.

초기에 필요한 기능과 동작의 제안은 [Paseo Adapter 초기 설계 초안](paseo-adapter-initial-design.md)을 참고한다.

이 목록은 Paseo CLI에서 발견한 기능을 정리한다. 모든 기능의 구현을 약속하거나 Worknaru의 지원 범위·구현 진행 상태를 관리하지 않는다. 기능의 채택과 구현 작업은 [프로젝트 기록 규약](project-records.md)에 따른다.

## 확인 기준

- 확인일: 2026-09-10.
- 기준 버전: 로컬에 설치된 Paseo CLI `0.8.0-beta.1`.
- 확인 방법: `paseo --version`, `paseo --help`, 각 명령 그룹의 `--help`와 필요한 개별 명령의 `--help`.
- 보조 자료: 확인일에 열람한 [공식 CLI 문서](https://paseo.sh/docs/cli.md)와 [스케줄 CLI 문서](https://paseo.sh/docs/schedules-cli.md).
- 확인 범위: 명령의 존재와 도움말에 설명된 기능. 실제 daemon 호출, Provider별 실행, SDK 지원 여부는 이 조사에서 검증하지 않았다.

위 기준은 이 목록을 작성한 당시의 조사 기록이다. 현재 프로젝트의 고정 버전과 실행 방법은 [개발 환경 안내](../apps/paseo-dev/README.md)를 따른다. 공식 웹 문서는 이후 변경될 수 있다. 적용할 CLI·SDK·daemon 버전을 확인하고, 실제 사용할 기능의 동작과 제약을 다시 검증한다. 이 목록은 CLI가 노출하는 기능의 개요이며, daemon API 전체 목록은 아니다.

아래 명령 앞에는 모두 `paseo`가 붙는다. 인자와 옵션은 주요 의미를 설명하는 경우를 제외하고 생략했다.

## 에이전트와 세션

| 기능 | 명령 | 도움말 기준 의미 |
| --- | --- | --- |
| 생성·시작 | `run` | 새 에이전트를 생성하고 작업을 시작한다. |
| 기존 세션 가져오기 | `import` | Provider의 기존 세션을 Paseo 에이전트로 등록한다. |
| 목록 조회 | `ls` | 에이전트 목록을 조회한다. 기본적으로 보관된 에이전트는 제외한다. |
| 상세 조회 | `inspect` | 에이전트의 상세 정보를 확인한다. |
| 후속 작업 전달 | `send` | 기존 에이전트에 메시지나 작업을 전달한다. |
| 출력 구독 | `attach` | 에이전트의 출력을 스트리밍으로 확인한다. |
| 실행 이력 조회 | `logs` | 에이전트의 활동과 타임라인을 확인한다. |
| 대기 | `wait` | 에이전트가 대기 상태가 될 때까지 기다린다. |
| 현재 작업 중단 | `stop` | 실행 중인 작업을 중단한다. 이미 대기 중이면 아무 작업도 하지 않는다. |
| 보관 | `archive` | 에이전트를 소프트 삭제한다. 영구 삭제와 구분한다. |
| 영구 삭제 | `delete` | 실행 중이면 중단한 뒤 에이전트를 영구 삭제한다. |
| 모드 변경 | `agent mode` | Provider별 실행 모드를 조회하거나 변경한다. |
| 설정·메타데이터 변경 | `agent update` | 확인한 옵션은 이름, thinking, 라벨 변경이다. |
| 실행 프로세스 재시작 | `agent reload` | 에이전트의 기반 프로세스를 재시작한다. |
| 부모 관계 해제 | `agent detach` | 에이전트를 중단하거나 이동하지 않고 하위 에이전트를 독립시킨다. |
| 앱에서 열기 | `agent open` | 기존 에이전트를 Paseo Desktop에서 연다. |

`run`, `ls`, `send` 등 기본 에이전트 명령은 `agent` 그룹 아래에서도 제공된다. 명령 이름을 Worknaru API로 그대로 채택하지 않고, 작업 완료·대기·중단·보관·삭제의 의미와 결과를 구분해 Runtime 계약을 정한다.

## 작업 환경과 상호작용

| 명령 그룹 | 하위 명령 | 기능 |
| --- | --- | --- |
| `project` | `create`, `ls`, `rename`, `delete` | 프로젝트 디렉터리 등록, 목록 조회, 이름 변경, 등록 제거. |
| `workspace` | `create`, `ls`, `rename`, `setup`, `archive` | 작업 공간 생성, 목록 조회, 이름 변경, 초기 설정 허용·실행, 소유 자원을 포함한 보관. |
| `terminal` | `create`, `ls`, `send-keys`, `capture`, `kill` | 터미널 생성, 목록 조회, 입력 전달, 출력 읽기, 종료. |
| `script` | `ls`, `start`, `stop` | 설정된 Workspace 스크립트 조회, 실행, 중단. |
| `provider` | `ls`, `models`, `diagnostic` | Provider 가용 상태, 모델 목록, 설치·실행 환경 진단. |
| `permit` | `ls`, `allow`, `deny` | 대기 중인 권한 요청 조회, 승인, 거부. |

이 표의 Workspace는 Paseo의 작업 공간이다. Worknaru Workspace와의 대응 관계는 이 목록에서 결정하지 않는다.

## 정기 실행과 Heartbeat

| 명령 그룹 | 하위 명령 | 기능 |
| --- | --- | --- |
| `schedule` | `create`, `ls`, `inspect`, `logs`, `update`, `pause`, `resume`, `run-once`, `delete` | 정기 작업 생성, 목록·상세·실행 이력 조회, 수정, 일시 중지, 재개, 단발 실행, 삭제. |
| `heartbeat` | `create`, `update`, `delete` | 현재 에이전트에 반복 프롬프트 전달, 실행 주기 변경, 삭제. |

- Schedule은 정해진 주기에 새 에이전트 작업을 시작하고, Heartbeat는 현재 에이전트에 반복 프롬프트를 전달하는 용도다. [공식 설명](https://paseo.sh/docs/schedules.md)
- 확인한 `schedule create` 옵션에는 `--cron`, `--every`, `--timezone`, `--run-now`, `--max-runs`, `--expires-in` 등이 있다.
- 확인한 `heartbeat create` 옵션에는 `--cron`, `--timezone`, `--max-runs`, `--expires-in` 등이 있다.
- 이 버전의 `heartbeat update`는 `--cron`과 `--timezone`을 통한 실행 주기 변경을 제공한다. 프롬프트 변경 기능으로 해석하지 않는다.
- 이 버전의 Heartbeat CLI에는 별도의 `ls`, `inspect`, `pause`, `resume` 명령이 없다. CLI·SDK·MCP의 기능 노출 범위는 각각 확인해야 한다.

## Daemon과 확장 기능 운영

| 명령 그룹 | 하위 명령 | 기능 |
| --- | --- | --- |
| `daemon` | `start`, `status`, `stop`, `restart`, `reload`, `pair`, `set-password` | Daemon 시작, 상태 조회, 종료, 재시작, 설정 재적용, 연결용 QR·링크 제공, 암호 설정. |
| `plugin` | `init`, `install` / `add`, `ls`, `logs`, `update`, `reload`, `enable`, `disable`, `remove` | 플러그인 생성, 설치, 조회, 로그 확인, 업데이트, 다시 로드, 활성화, 비활성화, 제거. |
| `hub` | `login`, `logout`, `init`, `connect`, `disconnect`, `status`, `projects`, `export`, `deploy`, `permissions` | Hub 인증, 초기 구성, Daemon 연결, 상태·프로젝트 조회, 트리거 내보내기, 구성 배포, 권한 관리. |
| `hub permissions` | `list`, `grant`, `revoke` | Hub의 Daemon 권한 조회, 부여, 회수. |

최상위 `start`, `status`, `reload`, `restart`는 Daemon 관리 명령의 별칭이다. `agent reload`와 `daemon reload`는 각각 에이전트 프로세스 재시작과 Daemon 설정 재적용으로 대상과 의미가 다르다.

## 기타 명령과 공통 옵션

| 명령·옵션 | 기능 |
| --- | --- |
| `clone` | GitHub 저장소를 복제하고 Paseo Workspace로 등록한다. |
| `onboard` | 초기 설정, Daemon 시작, 연결 안내를 제공한다. |
| `hooks` | 에이전트의 hook 활동을 기록한다. |
| `speech` | 명령은 등록되어 있으나 확인한 도움말에는 구체적인 하위 기능이 없다. |
| `--json`, `--format` | JSON, 표, YAML 등 출력 형식을 선택한다. |
| `--quiet`, `--no-headers`, `--no-color` | 출력을 간결하게 하거나 헤더·색상을 생략한다. |
| `--host` | 접속할 Daemon을 지정한다. 지원 연결 방식은 사용할 버전에서 확인한다. |
| `--help`, `help`, `--version` | 도움말과 CLI 버전을 확인한다. |

## 필요한 기능을 구현할 때

1. 해당 기능이 필요한 Worknaru의 사용 사례와 원하는 결과를 정한다.
2. `@getpaseo/client`에서 제공하는 호출·타입·이벤트를 확인하고, 필요한 경우 daemon API와 구현을 조사한다.
3. 입력·결과·상태·오류·이벤트의 의미를 Worknaru Runtime 계약으로 정의한다. 권한 요청, 비동기 작업, 재연결 등 해당 기능에 필요한 동작도 확인한다.
4. Paseo Adapter가 그 계약을 구현하고, Core와 CLI는 [ADR 0005](adr/0005-local-development-cli-boundary.md)의 의존 경계를 따른다.
5. 선택한 기능의 정상·실패 동작을 실제 사용할 버전 조합에서 검증한다.

기능 목록에 있다는 이유로 빈 인터페이스·패키지·구현을 미리 추가하지 않는다. 새로운 사용 사례에서 필요한 기능을 선택할 때 이 참고 목록을 다시 활용한다.
