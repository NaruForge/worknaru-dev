# 0002. pnpm workspace로 패키지 관리

- 날짜: 2026-09-10
- 상태: Accepted
- 승인 근거: npm과 pnpm의 차이 및 pnpm workspace 사용 제안을 설명한 대화에서 사용자가 "pnpm 승인합니다."로 명시적으로 승인했다.
- 관련 Work Item: 없음.
- 구현 링크: [package.json](../../package.json), [pnpm-workspace.yaml](../../pnpm-workspace.yaml), [pnpm-lock.yaml](../../pnpm-lock.yaml).

## Context

Worknaru는 CLI와 웹, 이를 구성하는 라이브러리를 하나의 저장소에서 개발한다. 외부 의존성을 설치하고 내부 패키지를 연결할 패키지 관리자가 필요하다.

npm workspaces와 pnpm workspace를 비교했으며, 패키지별 의존성을 명확하게 선언하고 누락된 의존성을 발견하는 데 도움이 되는 pnpm을 선택했다.

## Decision

- 패키지 관리는 pnpm workspace를 사용한다. 사용할 pnpm 버전은 루트 `package.json`의 `packageManager`에 지정한다.
- workspace 대상은 `pnpm-workspace.yaml`에서 관리하며, [저장소 구조 규칙](../repository-structure.md)에 따라 `apps/*`와 `packages/*`로 시작한다.
- 루트 `pnpm-lock.yaml` 하나를 Git으로 관리한다. 내부 패키지를 참조할 때는 `workspace:*`를 사용한다.
- 루트에서 `pnpm install`로 설치하고, lockfile 변경 없이 설치해야 할 때는 `pnpm install --frozen-lockfile`을 사용한다.

## Consequences

- 앱과 라이브러리의 의존성을 한 workspace에서 관리하고, lockfile을 기준으로 동일한 의존성 버전을 설치할 수 있다.
- 개발 환경과 CI에서 프로젝트가 지정한 pnpm 버전을 사용해야 한다.
- 패키지마다 사용하는 의존성을 명시해야 하며, 새 외부 패키지를 도입할 때 pnpm 환경에서 설치와 실행을 확인한다.

참고: [pnpm workspace](https://pnpm.io/workspaces), [pnpm의 의존성 배치 방식](https://pnpm.io/motivation).
