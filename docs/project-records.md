# 프로젝트 기록 규약

이 문서는 `NaruForge/worknaru-dev`의 repository work와 중요한 architecture decision을 기록하는 기준이다. 이후 사람과 Agent는 이 문서와 GitHub의 실제 기록을 사용한다. Blueprint를 다시 불러오거나 bootstrap Skill을 실행할 필요는 없다.

## 대상과 설치 상태

- Work Item provider: **GitHub**.
- 저장소와 Work Item 원본: [NaruForge/worknaru-dev Issues](https://github.com/NaruForge/worknaru-dev/issues).
- 선택 근거: 이미 GitHub 저장소와 접근 권한이 있으며, 여러 세션에 걸친 개발·실험을 코드 변경과 연결해 관리한다.
- 로컬 규약·Issue Form과 원격 Project·라벨·자동화 구성을 설치했다. Form은 이 저장소 기본 브랜치의 `.github/ISSUE_TEMPLATE/`에서 제공한다.
- 진행 상태의 원본: `NaruForge` 소유 비공개 [worknaru-dev Project #7](https://github.com/users/NaruForge/projects/7)의 단일 `Status` 필드.
- Project ID: `PVT_kwHOAmTnZc4BjCAh`. Status field ID: `PVTSSF_lAHOAmTnZc4BjCAhzhh34aQ`. 옵션 식별자는 실제 필드를 조회해 사용하며 이름과 별도로 수동 관리하지 않는다.
- [기존 worknaru Project #6](https://github.com/users/NaruForge/projects/6)은 `NaruForge/worknaru`의 기록이다. 현재 저장소의 원본으로 사용하거나 기존 항목을 이동하지 않는다.
- 이 문서의 설치 상태는 설정의 적용 여부만 설명한다. 업무 목록이나 업무별 진행 상태를 보관하지 않는다.

대체 local Issue, 상태 라벨, 수동 진행표를 만들지 않는다. Project에 등록되지 않은 이슈의 상태는 미설정으로 보고하며 `Inbox`라고 추정하지 않는다. 설치 시 설정을 검증했으며, 실제 lifecycle 동작은 이후 첫 실제 Work Item에서 확인한다.

## 정보별 원본

| 정보 | 유일한 원본과 사용법 |
| --- | --- |
| Content | GitHub Issue 제목·본문. 논의·승인 근거·검증 증거는 댓글 또는 관련 자료에 링크한다. 현재 범위와 완료 조건은 본문을 최신으로 유지한다. |
| Kind | Issue 라벨 `idea`, `work`, `bug` 중 정확히 하나. |
| Progress | 이 저장소 전용 Project의 `Status`. 본문·상태 라벨·로컬 파일·수동 인덱스에 복제하지 않는다. |
| Modifier | `blocked`, `needs-triage` Issue 라벨. 진행 단계가 아니다. |
| Closure | GitHub Issue의 state와 state reason. 상세 종료 판정·이유·근거는 종료 댓글에 남긴다. |
| Dependency | GitHub Issue Relationships의 `blocked by` / `blocking`. 부모·하위 이슈는 업무 분해 관계이며 의존성을 자동으로 뜻하지 않는다. |
| Release scope | GitHub Milestone. 실제 릴리스나 납품 범위가 정해졌을 때만 사용하며 진행 단계로 쓰지 않는다. |
| Assignee | GitHub Issue의 Assignees. Project에 보이는 native 필드는 같은 원본의 표시다. |
| Priority·area | 현재 별도 체계를 채택하지 않는다. 필요해지면 원본과 필드를 제안하고 승인 후 추가한다. |
| Personal next action | 사용 중인 개인 업무 시스템. Issue 링크만 두고 프로젝트 backlog나 상태를 복제하지 않는다. |
| Completed change | Git 커밋과 병합된 PR 이력. 별도 완료 장부를 만들지 않는다. |
| Durable decision | 프로젝트 Git 저장소의 `docs/adr/`. 결정 상태를 이슈 라벨이나 별도 인덱스에 복제하지 않는다. |

저장소와 이슈는 공개다. 게시할 기록에는 자격증명, 개인 자료, 비공개 외부 자료의 원문을 넣지 않는다. 비공개 Project가 공개 Issue 본문까지 비공개로 만드는 것은 아니다.

## 종류와 접수

| Canonical kind | Native label | 의미 |
| --- | --- | --- |
| `idea` | `idea` | 아직 구현이 승인되지 않은 제안. |
| `work` | `work` | 승인된 범위 안에서 하나의 검증 가능한 결과를 만드는 작업. |
| `bug` | 기존 `bug` | 기대 동작과 다른 재현 가능한 문제. |

승인 근거는 사용자의 명시적 지시 또는 권한 있는 담당자의 결정에 연결한다. Form 선택, 라벨 부착, `Ready` 설정 자체는 구현 승인을 대신하지 않는다. 이미 승인된 작업은 그 범위 안에서 진행하며 같은 승인을 반복해서 요구하지 않는다.

구현하기로 채택한 `idea`를 같은 Issue에서 수행한다면 승인 근거와 완료 조건을 정리한 뒤 `idea`를 `work`로 바꾼다. 별도의 실행 결과가 필요해 새 작업을 나누는 경우에는 이슈끼리 링크하며 같은 업무를 중복 관리하지 않는다. `bug` 수정은 종류를 유지한다.

모든 Work Item에는 문제·배경, 원하는 결과, 범위, 제외 범위, 검증 가능한 완료 조건, 의존성·위험, 관련 근거가 드러나야 한다. 짧게 작성해도 되며 없는 내용은 `없음`, 조사 전 정보는 `미확인`으로 구분한다. `idea`의 완료 조건은 조사·평가·채택 판단의 조건으로 작성할 수 있다.

Form은 [아이디어](../.github/ISSUE_TEMPLATE/01-idea.yml), [작업](../.github/ISSUE_TEMPLATE/02-work.yml), [버그](../.github/ISSUE_TEMPLATE/03-bug.yml)를 사용한다. CLI·API로 작성하는 Agent도 같은 정보를 포함한다. Form은 클라이언트별 요청을 강제로 검증하는 서버 정책이 아니다. Bug는 환경, 재현 절차, 기대 동작, 실제 동작을 확인된 만큼 기록한다.

기존 라벨 10개는 보존한다. 그중 `bug`만 canonical kind로 재사용하며, `enhancement`, `question`, `duplicate`, `wontfix` 등 기존 라벨을 새로운 종류·진행 상태·종료 판정의 원본으로 해석하지 않는다.

## 진행과 종료

진행 원본은 단일 선택 필드 `Status`다.

| 값 | 의미 |
| --- | --- |
| `Inbox` | 접수됐으며 분류·검토 전. |
| `Backlog` | 내용은 정리됐으나 착수 준비 전. |
| `Ready` | 수행 범위·완료 조건·필요한 승인이 갖춰짐. |
| `In progress` | 실제 수행 중. |
| `In review` | 결과와 완료 조건을 검증·검토 중. |
| `Done` | 완료 조건 충족과 결과 확인이 끝남. |

`Inbox -> Backlog -> Ready -> In progress -> In review -> Done`의 의미를 유지한다. 실제 상황에 맞게 상태를 바꾸며 가짜 활동이나 검증용 상태 이동을 만들지 않는다. 재작업이 필요하면 실제 단계로 되돌린다.

- `needs-triage`: 분류·내용 확인이 필요함을 표시하고 해결되면 제거한다. 새 접수의 진행 상태는 별도로 Project가 소유한다.
- `blocked`: 외부 시스템, 권한, 사람의 결정 대기 등 Issue dependency 관계만으로 표현되지 않는 차단 사유에 사용한다. 사유와 해제 조건은 관련 댓글에 남긴다. 이슈 간 선행 관계는 Relationships에만 유지한다.
- 완료: 검증 결과나 채택된 산출물을 링크하고 `Status = Done`, Issue 종료 사유 `completed`가 일치하는지 확인한다.
- 기각·중복·불필요·의도적 폐기: 종료 댓글에 `판정`, `이유`, `근거/관련 Issue`를 남기고 종료 사유 `not planned`로 닫는다. 마지막 실제 진행 상태를 유지하며 `Done`으로 올리지 않는다.
- 재개: 재개 이유를 남기고 Issue를 연 뒤 실제 단계로 `Status`를 설정한다. 열린 이슈가 `Done`에 방치되지 않도록 확인한다.
- 조사·실험: 구현을 채택하지 않아도 승인된 검증 질문에 답하고 완료 조건을 충족했다면 해당 조사 작업은 완료할 수 있다. 조사 완료와 조사 대상 제안의 기각은 서로 다른 판정이다.

닫힌 이슈는 종료 사유와 함께 읽는다. `not planned`로 닫힌 항목의 남아 있는 `Status`는 종료 전 마지막 단계다. PR 병합이나 Issue 자동 종료만으로 완료 조건이 충족됐다고 추정하지 않는다. 종료 작업 뒤에는 Issue와 Project의 실제 상태를 함께 확인한다.

## ADR

다음 중 하나에 해당하는 중요한 실제 결정에 ADR을 사용한다: 이후 작업을 크게 제약함, 의미 있는 대안 중 선택함, 되돌리기 어려움, 미래 유지보수자가 선택 이유를 알아야 함. 작업 순서, 일시적인 조사, 함수 이름이나 작은 구현 선택은 이슈·일반 문서에 둔다.

- 위치: `docs/adr/`.
- 파일명: `NNNN-kebab-case-title.md`. 기존 번호를 조사해 다음 미사용 번호를 쓰며 기존 기록을 다시 번호 매기지 않는다.
- 상태: `Proposed`, `Accepted`, `Rejected`, `Superseded`.
- 본문: `Context`, `Decision`, `Consequences`. 날짜·상태·관련 Work Item과 구현 링크를 함께 기록한다.
- 중요한 실제 결정을 기록할 때 처음 디렉터리를 만든다. 빈 디렉터리, placeholder ADR, 수동 상태 인덱스는 만들지 않는다.
- 승인·기각은 사용자의 지시나 권한 있는 담당자의 결정 근거를 반영한다. Agent가 설치를 이유로 결정을 채택하거나 상태를 올리지 않는다.
- `Accepted`·`Rejected` 기록의 역사적 의미는 보존한다. 결정이 바뀌면 새 ADR을 작성하고 이전 기록을 `Superseded`로 표시하며 양방향으로 연결한다.

이슈는 해결할 작업과 검증 결과를, ADR은 장기적으로 유효한 선택 이유를 소유한다. 두 기록은 링크로 연결하고 내용을 복제하지 않는다.

## 원격 구성과 적용 경계

다음은 로컬 설치와 별도로 승인받아 적용한 구성이다.

| 대상 | 적용 구성 |
| --- | --- |
| Project | `NaruForge` 소유 비공개 `worknaru-dev` 1개. `NaruForge/worknaru-dev` 저장소만 연결. |
| 설명 | `worknaru-dev 저장소의 작업과 실험을 관리합니다.` |
| Progress field | 위 여섯 값의 `Status` 1개. 동일 의미의 필드나 상태 라벨은 추가하지 않는다. |
| Views | [All issues Table](https://github.com/users/NaruForge/projects/7/views/1): `is:issue`. [Board](https://github.com/users/NaruForge/projects/7/views/2): `is:issue is:open`, `Status`별 열. 둘 다 같은 native 원본을 표시한다. |
| 새 라벨 | `idea`, `work`, `blocked`, `needs-triage`. 기존 `bug` 재사용. |
| Auto-add | 대상 저장소 `NaruForge/worknaru-dev`, 필터 `is:issue is:open`. |
| Item added | Project에 새로 추가된 항목의 `Status`를 `Inbox`로 설정. |
| Item closed / PR merged | 기본 자동 `Done` 전환 비활성화. 기각·폐기를 완료로 오인하지 않게 한다. |
| 기타 기본 workflow | 하위 이슈 자동 등록·Issue 자동 종료·PR 연결에 따른 상태 전환은 비활성화. 활성 workflow는 위 Auto-add와 Item added 두 개다. |
| 추가 설정 | 별도 Actions·동기화·마일스톤·우선순위 필드·저장소 설정 변경 없음. |

Form의 기본 라벨은 idea에 `idea`, `needs-triage`, work에 `work`, bug에 `bug`, `needs-triage`다. Form에서 담당자·Project를 자동 지정하지 않으며 Project 등록은 위 Auto-add가 담당한다. 새 라벨 4개는 생성했고 기존 라벨 10개는 보존했다. Form을 수정할 때는 기본 브랜치에 공개된 실제 설정도 확인한다.

이 설치에서는 로컬 파일 생성과 위 원격 구성·최초 커밋·기본 브랜치 푸시를 각각 승인받았다. 이후 Project·라벨·필드·뷰·workflow 변경, 인증 변경, 커밋·푸시, 실제 이슈 생성·종료, ADR 채택·대체는 해당 작업에 대한 사용자 지시와 승인 범위를 따른다. 기록 체계의 추가 원격 변경은 정확한 대상과 내용을 제시하고 별도로 승인받는다. 이 규약은 승인된 일상 업무를 매번 재승인받도록 요구하지 않는다.

기존 기록이나 정책과 충돌하면 차이를 보고하고 보존·통합·미적용 중 선택을 제안한다. 자동 migration, rename, renumber, normalize, overwrite는 하지 않는다. 생성 경로는 실제 프로젝트 루트 내부로 제한하며 사용자 홈·전역 Skill·프로젝트 밖 공유 경로에 파일이나 상태를 만들지 않는다.

## 검증과 유지

로컬 생성 후에는 모든 파일을 다시 읽어 상대 링크, YAML·Form 구조, 종류·상태 매핑, 정보별 원본, Receipt의 단일성과 revision 일치를 검사한다. Git 상태로 승인된 변경만 있는지 확인한다. 별도 validator나 검증 보고서 파일을 운영 산출물로 추가하지 않는다.

승인된 원격 변경 후에는 라벨·Project·필드·뷰·workflow·저장소 연결과 Form의 실제 설정을 변경 그룹마다 다시 읽는다. 설정 확인과 실제 lifecycle 사용 검증을 구분하며, 실제 흐름은 이후 진짜 Work Item에서 확인한다. 설치 증명을 위한 가짜 이슈, placeholder, 빈 ADR, 임의 상태 이동은 만들지 않는다.

설치 전후에 파일·원격 설정이 바뀌었거나 인증·권한·경로·소유권·의미 충돌이 확인되면 해당 변경 전에 멈추고 차이와 미적용 범위를 보고한다. 실패를 이유로 권한을 넓히거나 다른 원본으로 대체하지 않는다. 되돌리기는 이번 생성물에 한정하며, 기존 자료나 이후 실제 업무가 담긴 원격 객체를 자동 삭제하지 않는다.

지속적인 Skill·bootstrap runtime·동기화 서비스는 사용하지 않는다. 이 문서와 Agent 안내, GitHub의 native 기능으로 운영한다. 설치 provenance는 [단일 Receipt](../.agents/blueprints/establish-project-records.yaml)에만 둔다. 업데이트 검토가 요청되면 Receipt의 revision과 canonical `BLUEPRINT.md` 경로의 마지막 변경 commit을 비교하고 의미 차이를 제안한다. 자동 재생성하거나 업데이트를 감시하지 않는다.
