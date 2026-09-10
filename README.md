# Worknaru

누구나 자신의 업무를 AI 기반 Module로 만들고, 그것들을 하나의 Workspace에서 조합·실행할 수 있게 하는 플랫폼.

현재 구현은 CLI와 Web UI를 통한 전용 Paseo Daemon 상태 조회다. Module·Workspace의 개발·조합·실행 기능은 후속 구현 대상이다.

[개념 아키텍처](docs/architecture.md)는 CLI와 Web UI의 공통 구성요소, 호출 흐름과 실행 환경의 경계를 설명한다.

개발 환경에서 CLI를 사용하려면 [Worknaru CLI 실행 안내](apps/cli/README.md)를 참고한다. Daemon 연결과 CLI 연동은 [Paseo 개발 환경 검증](apps/paseo-dev/README.md)에서 확인한다.

웹 상태 조회는 `pnpm web:dev`로 실행한다. 로컬 주소와 확인·종료 절차는 [Worknaru Web UI 안내](apps/web/README.md)를 참고한다.

코드나 문서를 변경하기 전에 [프로젝트 기록 규약](docs/project-records.md)을 읽는다. 파일·패키지의 배치는 [저장소 구조 규칙](docs/repository-structure.md)을 따른다. 전체 빌드와 자동 테스트는 루트에서 `pnpm test`로 실행한다.
