# 리브랜딩 설정

웹과 CLI가 같은 제품 표시 이름을 사용하도록 빌드 시 브랜드를 확정한다. [brand.json](brand.json)을 수정하고 저장소 루트에서 `pnpm build`를 실행한다. 실행 중인 개발 환경은 `pnpm exec worknaru dev stop` 후 `pnpm exec worknaru dev start`로 다시 시작한다. 이 시작 명령이 재빌드하므로 별도 빌드는 생략할 수 있다. 입력 수정만으로 기존 빌드가 바뀌지는 않는다.

```json
{
  "displayName": "우리 팀 도구",
  "accentColor": "#225c9e",
  "logo": "assets/logo.png",
  "favicon": "assets/favicon.png",
  "links": {
    "home": "https://example.com/",
    "docs": "https://example.com/docs",
    "support": "https://example.com/support"
  }
}
```

자산을 지정하려면 이 패키지의 `assets/`에 파일을 먼저 넣는다. 기본 설정처럼 로고·파비콘을 생략해도 된다. 예시 URL은 실제 운영 주소로 바꾸거나 링크 항목을 생략한다.

| 항목 | 규칙·생략 시 동작 |
| --- | --- |
| `displayName` | 필수. 1~80자. 완성형 한글 `가-힣`, 영문 `A-Z a-z`, 숫자 `0-9`, 일반 공백(U+0020), 기호 `- _ . & ( )`만 허용. 앞뒤 공백 불가. HTML로 해석하지 않는 일반 텍스트 |
| `accentColor` | `#RRGGBB`. 기본 `#225c9e`. 버튼에 적용하고 글자는 대비에 따라 검정/흰색 선택. 상태 의미를 나타내는 색은 유지 |
| `logo` | `assets/logo.png`만 허용. 생략하면 미표시 |
| `favicon` | `assets/favicon.png` 또는 `assets/favicon.ico`만 허용. 생략하면 빈 파비콘 |
| `links` | `home`, `docs`, `support`만 허용. 인증 정보·공백 없는 ASCII HTTP(S) URL. 생략하면 미표시 |

이모지·분해된 한글 자모·탭·줄바꿈·특수 공백은 표시 이름에 사용할 수 없다. 자산 경로는 대소문자까지 위 표의 고정 이름을 사용한다. 임의 파일명이나 한글·공백 파일명은 빌드에서 거부한다.

한글 주소를 링크하려면 도메인은 Punycode, 경로·query는 퍼센트 인코딩된 ASCII 표현으로 입력한다. 예를 들어 `https://example.com/우리 팀`은 `https://example.com/%EC%9A%B0%EB%A6%AC%20%ED%8C%80`으로 입력한다. `%20`처럼 인코딩된 공백은 허용하며, 원문 한글·공백은 빌드에서 거부한다.

자산은 파일당 1 MiB 이하이며 확장자와 파일 형식 식별자가 일치해야 한다. 외부 이미지 URL·SVG·임의 HTML/CSS/스크립트는 입력으로 받지 않는다. 잘못된 필드·값·자산을 명시하면 빌드가 실패한다. 선택 항목의 생략만 기본 동작을 사용한다.

생성된 `dist/`는 빌드가 관리하므로 직접 수정하지 않는다. 기본 브랜드로 되돌리려면 manifest를 기본값으로 바꾸고 다시 빌드한다. 이전 생성 자산은 다음 빌드에서 제거하지만 입력 `assets/`는 보존한다.

## 지원 경계

한 빌드에 브랜드 하나를 사용한다. 빌드 전에도 실행할 수 있는 CLI 진단·도움말은 브랜드 산출물이 없으면 기본 이름 Worknaru를 표시한다. 웹 제목·메타 설명·헤더·정적 자산·링크와 CLI 제목·제품 오류 문구에 적용한다. 실제 명령 예시는 `worknaru`, 환경 변수 접두사는 `WORKNARU_`로 유지한다. API/JSON 구조·오류/종료 코드·패키지 이름·내부 식별자는 바뀌지 않는다. 사용자용 오류 메시지는 변경될 수 있으므로 프로그램은 오류 코드로 분기한다.

저장 위치는 별개인 [개발 실행기의 `WORKNARU_DATA_DIR`](../../apps/paseo-dev/README.md#저장-위치-설정)로 지정한다. 기본값을 포함한 데이터 루트의 폴더명은 영문·숫자·`-_.`만 허용하며 한글·공백은 거부한다. 표시 이름을 바꾸어도 데이터 경로·서버 ID·인증 정보가 바뀌지 않는다. 실행 중 전환·사용자별 브랜드·개별 저장 경로·자동 데이터 이전·OS 서비스 등록 변경은 지원하지 않는다.

Core·Runtime·Adapter는 이 패키지를 사용하지 않는다. 앱의 표시 계층과 빌드만 생성된 읽기 전용 정의를 사용한다. 결정 근거는 [ADR 0004](../../docs/adr/0004-build-time-branding-and-data-root.md), 작업·검증 근거는 [Issue #13](https://github.com/NaruForge/worknaru-dev/issues/13)에 있다.
