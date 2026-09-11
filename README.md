# Worknaru

누구나 자신의 업무를 AI 기반 Module로 만들고, 그것들을 하나의 Workspace에서 조합·실행할 수 있게 하는 플랫폼.

현재 구현은 CLI와 Web UI를 통한 전용 Paseo Daemon 상태 조회다. Module·Workspace의 개발·조합·실행 기능은 후속 구현 대상이다.

[개념 아키텍처](docs/architecture.md)는 CLI와 Web UI의 공통 구성요소, 호출 흐름과 실행 환경의 경계를 설명한다.

개발 환경에서 CLI를 사용하려면 [Worknaru CLI 실행 안내](apps/cli/README.md)를 참고한다. Daemon 연결과 CLI 연동은 [Paseo 개발 환경 검증](apps/paseo-dev/README.md)에서 확인한다.

웹 상태 조회는 `pnpm web:dev`로 실행한다. 로컬 주소와 확인·종료 절차는 [Worknaru Web UI 안내](apps/web/README.md)를 참고한다.

설정으로 자신의 브랜드를 쉽게 적용할 수 있다. 표시 이름·로고·파비콘·대표 색상·홈페이지/문서/지원 링크를 바꾸고 `pnpm build`로 반영한다. 저장 위치는 `WORKNARU_DATA_DIR`로 루트 하나를 지정한다. [리브랜딩 설정](packages/branding/README.md) · [저장 위치 설정](apps/paseo-dev/README.md#저장-위치-설정)

표시 이름에는 한글과 일반 공백을 쓸 수 있다. 이미지 파일명은 `logo.png`와 `favicon.png`/`favicon.ico`, 링크 입력은 ASCII URL로 제한한다. 데이터 루트는 기본값까지 포함해 폴더명에 영문·숫자·`-_.`만 허용한다. 저장소 상위 경로에 한글·공백이 있으면 지원되는 절대경로를 별도 루트로 지정해야 한다.

CLI 명령 `worknaru`, 환경 변수 접두사, 패키지·API·내부 식별자 변경은 지원하지 않는다. 실행 중 브랜드 전환, 개별 저장 경로 지정, 기존 데이터 자동 이전과 OS 서비스 이름 변경도 지원 범위에 포함하지 않는다.

코드나 문서를 변경하기 전에 [프로젝트 기록 규약](docs/project-records.md)을 읽는다. 파일·패키지의 배치는 [저장소 구조 규칙](docs/repository-structure.md)을 따른다. 전체 빌드와 자동 테스트는 루트에서 `pnpm test`로 실행한다.
