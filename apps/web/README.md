# Worknaru Web UI

전용 Paseo Daemon의 상태를 확인하는 작은 웹 앱이다. **상태 확인** 버튼을 누르면 Core API를 호출하고, 연결 결과와 성공 시 서버 ID·Paseo 버전을 표시한다.

## 직접 실행

이름·로고·파비콘·대표 색상·관련 링크는 [공통 리브랜딩 설정](../../packages/branding/README.md)을 수정해 재빌드한다. 브랜드는 실행 중 바뀌지 않으며 서버 식별자와 상태 조회 동작은 유지한다.

저장소 루트에서 실행한다.

```powershell
pnpm install --frozen-lockfile --store-dir .pnpm-store
pnpm web:dev
```

실행 명령이 `<표시 이름> Web UI: http://127.0.0.1:6868/`를 출력하면 같은 PC의 브라우저에서 해당 주소를 연다. 기본 표시 이름은 Worknaru다. 터미널은 실행한 채로 두고 **상태 확인**을 누른다. 종료하려면 그 터미널에서 `stop`을 입력하고 Enter를 누르거나 Ctrl+C를 누른다.

가장 작은 확인 순서는 다음과 같다.

1. 버튼을 눌러 **연결 성공**, 서버 ID와 `0.8.0` 버전 표시를 확인한다.
2. 브라우저 탭을 유지한 채 실행 터미널에서 `stop`을 입력한다.
3. 열린 화면의 버튼을 다시 눌러 **연결 실패**와 서버 정보가 비워지는 것을 확인한다. Daemon이 웹 파일도 제공하므로 이 단계에서는 페이지를 새로고침하지 않는다.
4. 다시 `pnpm web:dev`를 실행하면 같은 탭에서 정상 조회를 재시도할 수 있다.

포트나 전용 Daemon이 이미 사용 중이면 새 실행을 거부한다. `paseo:verify`와 `web:dev`는 같은 전용 환경을 사용하므로 동시에 실행하지 않는다. 오류·로그 위치와 운영 분리 기준은 [개발 환경 안내](../paseo-dev/README.md)를 따른다.

## 실행 구조

- [시작 코드](src/bootstrap.ts)가 Paseo Adapter를 만들고 Core에 주입한다. [화면 코드](src/main.ts)는 Core의 `getDaemonStatus()`를 호출한다.
- [빌드](build.mjs)는 TypeScript 검사 후 화면·Core·Adapter·Paseo Client를 브라우저용 `dist/app.js`에 함께 묶는다. 공통 브랜드로 HTML·CSS를 생성하고 정적 브랜드 자산을 `dist`에 복사한다.
- 개발 실행 프로그램은 [지정 데이터 루트](../paseo-dev/README.md#저장-위치-설정)의 `tmp/web-*`에 허용된 웹 자산을 복사한다. 자신이 시작한 Daemon의 소유권·서버 ID를 확인한 뒤 이 폴더의 `connection.json`에 공개 대상 ID와 예상 서버 ID를 쓴다. 비밀번호·Provider 인증 정보·Daemon 설정·로그는 제공하지 않는다. 임시 웹 폴더는 해당 실행 종료 시 정리한다.
- 브라우저는 이 설정을 읽고 페이지와 같은 호스트의 `/ws`로 접속한다. Daemon이 정적 파일 제공과 WebSocket 접속을 모두 맡으며 별도 Worknaru API 서버는 없다.
- 기본 조회 제한 시간은 5초다. 조회 중 버튼을 비활성화하고, 완료 후 조회용 연결을 정리한다. 연결 실패를 원격 프로세스 종료의 확정 판정으로 사용하지 않는다.

현재 실행 명령은 `127.0.0.1`에만 바인딩하는 로컬 개발용이다. 인증 입력·대상 선택·설정 저장·지속 연결·Agent 실행 기능은 없다. Node.js와 브라우저에 공통인 Web Crypto를 사용하므로 브라우저에서는 localhost 또는 HTTPS 실행 환경이 필요하다. 원격 공개·배포는 이 테스트에 포함하지 않는다.

## 검증

`pnpm test`는 웹 타입 검사·브라우저 빌드와 기존 CLI·Adapter 테스트를 수행한다. `pnpm paseo:verify`는 실제 전용 Daemon의 SDK·Adapter·CLI 연동을 확인한다. 브라우저 확인은 위 실행 절차로 수행하며 자동 브라우저 테스트가 `pnpm test`에 포함되는 것은 아니다.

실제 브라우저의 정상 조회·종료 후 실패·소켓 정리와 loopback 응답 서버를 사용한 인증 오류·대상 불일치·시간 초과 검증의 근거는 [Issue #9](https://github.com/NaruForge/worknaru-dev/issues/9)에 둔다. Paseo `0.8.0` 전환 후 같은 경로를 재검증한 근거는 [Issue #11](https://github.com/NaruForge/worknaru-dev/issues/11)에 연결한다.
