# Project instructions

## 프로젝트 목적

>누구나 자신의 업무를 AI 기반 Module로 만들고, 그것들을 하나의 Workspace에서 조합·실행할 수 있게 하는 플랫폼.

## 관리 규칙

Worknaru는 설정으로 쉽게 리브랜딩할 수 있다. 지원 범위는 빌드 시 고정하는 표시 이름·로고·파비콘·대표 색상·홈페이지/문서/지원 링크와 `WORKNARU_DATA_DIR`로 지정하는 단일 저장 루트다. CLI 명령 `worknaru`, 환경 변수 접두사, 패키지·API·내부 식별자 변경과 실행 중 브랜드 전환·개별 저장 경로·자동 데이터 이전·OS 서비스 이름 변경은 지원하지 않는다.

표시 이름은 완성형 한글·영문·숫자·일반 공백과 제한된 기호를 지원한다. 이미지 입력은 고정 파일명, 링크는 ASCII URL, 기본값을 포함한 데이터 루트의 폴더명은 영문·숫자·`-_.`로 제한한다. 상세 입력 규칙과 예시는 [리브랜딩 설정](packages/branding/README.md)과 [저장 위치 설정](apps/paseo-dev/README.md#저장-위치-설정)을 따른다.

사용자용 제품 문구는 [공통 브랜드 정의](packages/branding/README.md), 개발 실행기의 데이터 경로는 [공통 경로 해석](apps/paseo-dev/paths.mjs)을 사용한다. 이름 변경이 데이터·서버 ID·인증 정보에 영향을 주지 않게 한다.

Repository work와 architecture decision의 기록은
[프로젝트 기록 규약](docs/project-records.md)을 먼저 읽고 따른다.

파일·패키지를 추가하거나 이동할 때는
[저장소 구조 규칙](docs/repository-structure.md)을 먼저 읽고 따른다.

패키지 관리는 루트 [package.json](package.json)의 `packageManager`에 지정된 pnpm을 사용한다.

기록 원본·진행 상태·ADR 상태를 다른 문서나 tracker에 중복 관리하지 않는다.
사용자가 승인한 작업 범위를 따르며, 기록 체계 변경은 별도로 제안한다.
