# PacHub — Discord GitHub Collaboration Bot

> Discord 안에서 GitHub 저장소, 이슈, Pull Request를 조회하고 변경 위험을 검토할 수 있는 개발 협업 봇입니다.

PacHub은 Discord를 개발 협업의 진입점으로 만드는 개인 개발 프로젝트입니다. 현재 GitHub 읽기 전용 조회, PR 변경사항의 규칙 기반 분석, 선택적 AI 보조 요약을 제공합니다. 코드 변경, Pull Request 생성, merge, 배포는 의도적으로 구현하지 않았습니다.

## 현재 가능한 작업

- `/ping` — 봇 상태와 응답 시간 확인
- `/repo` — 저장소 정보 조회
- `/issue` — 이슈 정보 조회
- `/pr` — Pull Request·CI 상태 조회
- `/review` — PR diff의 파일 분류, 위험 신호, 테스트 변경 여부 요약
- `/github-connect`, `/github-disconnect`, `/github-config` — 서버별 기본 저장소 설정
- `/github-role-add`, `/github-role-remove`, `/github-roles` — 역할 ID 기반 권한 설정
- `/analyze-issue` — 이슈의 원인 후보와 수정·테스트 계획을 읽기 전용으로 제안

모든 GitHub 조회는 읽기 전용이며, Discord 응답은 멘션을 발생시키지 않도록 안전하게 처리합니다.

## 기술 스택

Node.js, TypeScript, discord.js, dotenv, zod, pino, Vitest, ESLint, Prettier, Docker.

## 설치 및 실행

Node.js 22 이상이 필요합니다.

```bash
npm install
cp .env.example .env
# .env에 Discord Developer Portal의 값 입력
npm run register-commands
npm run dev
```

`DISCORD_GUILD_ID`를 설정하면 해당 개발 서버에 즉시 명령어가 등록됩니다. 비워두면 전역 등록되며 Discord 반영에 시간이 걸릴 수 있습니다.

필수 환경 변수는 다음과 같습니다.

```dotenv
DISCORD_TOKEN=
DISCORD_CLIENT_ID=
DISCORD_GUILD_ID=
GITHUB_TOKEN=
DATABASE_URL=file:./data/pachub.sqlite
NODE_ENV=development
LOG_LEVEL=info
```

Discord Developer Portal에서 애플리케이션을 만들고 Bot Token을 발급한 뒤, `applications.commands`와 `bot` 범위로 서버에 초대하세요.

## GitHub 연결 설정

GitHub 조회에는 Fine-grained PAT 또는 GitHub App installation token을 사용하세요. 토큰에는 선택한 저장소만 연결하고 Metadata, Contents, Issues, Pull requests, Checks의 **Read** 권한만 부여합니다. Write, Administration, Workflows 권한은 필요하지 않습니다.

`GITHUB_TOKEN`이 없더라도 `/ping`은 동작합니다. `/repo`, `/issue`, `/pr`은 설정 안내를 표시합니다. 토큰은 `.env`에만 저장하고 Git·Discord·로그·스크린샷에 올리지 마세요. 노출되었다면 GitHub Settings에서 즉시 revoke한 뒤 새 토큰을 발급하세요.

## 명령어

`/ping`은 봇 상태, Discord 응답 시간, 실행 환경, 버전을 임시(ephemeral) 메시지로 보여줍니다.

- `/repo owner:<소유자> repository:<저장소>` — 저장소 기본 정보
- `/issue owner:<소유자> repository:<저장소> number:<번호>` — 이슈 정보
- `/pr owner:<소유자> repository:<저장소> number:<번호>` — PR 통계, 리뷰 상태, CI 상태
- `/review owner:<소유자> repository:<저장소> pr-number:<번호>` — PR diff의 규칙 기반 변경·위험 요약
- `/analyze-issue number:<번호> [owner:<소유자> repository:<저장소>] [use-ai:true]` — 이슈·댓글·연결 PR 단서를 분석

### `/analyze-issue`

`/analyze-issue`는 REVIEWER 이상만 실행할 수 있습니다. 서버 소유자와 Discord Administrator는 ADMIN으로 처리됩니다. 기본 저장소가 연결되어 있다면 `/analyze-issue number:132`처럼 실행하고, 직접 지정할 때는 owner와 repository를 반드시 함께 제공합니다. `use-ai:true`는 설정된 OpenAI 호환 AI에 제한된 분석 요약을 요청하지만, AI가 없거나 실패해도 규칙 기반 결과는 제공합니다.

결과에는 이슈·댓글의 제한된 단서, 관련 PR·파일 후보, 원인 후보, 수정 계획, 테스트 계획, 추가 질문을 포함합니다. 이 기능은 코드를 실행·수정하지 않고 GitHub에 댓글·Check Run·PR을 작성하지 않습니다. 이슈와 댓글은 신뢰할 수 없는 데이터로 취급하며, prompt injection 문구를 지시로 따르지 않습니다. 결과는 항상 ephemeral이며 코드 원문과 토큰은 출력하지 않습니다.

### 서버별 기본 저장소와 역할 권한

Discord 서버 소유자와 Discord `Administrator` 권한 보유자는 항상 봇의 ADMIN입니다. 그 외 사용자는 역할 **이름이 아닌 역할 ID**를 기준으로 가장 높은 등록 권한을 받습니다.

| 권한     | 사용할 수 있는 명령                                         |
| -------- | ----------------------------------------------------------- |
| VIEWER   | `/repo`, `/issue`, `/pr`, `/github-config`, `/github-roles` |
| REVIEWER | VIEWER 권한 + `/review`                                     |
| ADMIN    | REVIEWER 권한 + 연결 및 역할 설정 변경                      |

ADMIN은 `/github-connect owner:<owner> repository:<repo>`로 현재 서버에 기본 저장소를 연결합니다. 이미 연결되어 있으면 `confirm-replace:true`를 명시해야 교체됩니다. `/github-disconnect confirm:true`는 연결만 해제하며 역할 설정은 보존합니다. `/github-role-add role:@역할 permission:VIEWER|REVIEWER|ADMIN`으로 권한을 설정하고 `/github-role-remove`으로 제거합니다. `@everyone` 및 통합 관리 역할은 등록할 수 없습니다.

기본 저장소가 연결된 Guild에서는 `/repo`, `/issue number:10`, `/pr number:20`, `/review pr-number:20`처럼 owner와 repository를 생략할 수 있습니다. 둘 중 하나만 제공할 수 없으며, DM에서는 두 값을 모두 직접 제공해야 합니다. 역할 설정이 하나라도 있는 서버 또는 기본 저장소 사용 요청에는 권한 정책이 적용됩니다. 역할 설정이 없는 서버에서 owner와 repository를 모두 직접 입력하는 기존 공개 조회 동작은 유지됩니다.

GitHub 조회와 리뷰 응답은 모두 ephemeral로 처리합니다. 이는 비공개 저장소의 Issue, PR 및 리뷰 정보를 공개 채널에 노출하지 않기 위한 정책입니다. 권한 없는 사용자에게는 연결된 저장소의 존재 여부를 표시하지 않습니다.

### SQLite 데이터베이스

`DATABASE_URL`의 기본값은 `file:./data/pachub.sqlite`입니다. 봇 시작 시 필요한 SQLite 테이블을 생성합니다. DB에는 Guild별 저장소 메타데이터, 역할 ID 권한, 민감정보를 제외한 감사 로그만 저장하며 GitHub/Discord 토큰과 AI 키는 저장하지 않습니다. `data/`는 Git에서 제외됩니다.

Docker에서는 데이터를 유지하려면 `/app/data`에 볼륨을 마운트하세요.

```bash
docker run --rm --env-file .env -v pachub-data:/app/data discord-github-bot
```

예를 들어 `/repo owner:octocat repository:Hello-World`처럼 GitHub URL이 아닌 소유자와 저장소 이름만 입력합니다. `.git` 접미사는 허용되며 제거됩니다. `/issue`는 본문 요약, 담당자, 라벨, 마일스톤, 댓글 수를 표시하며 PR 번호를 입력하면 `/pr` 사용을 안내합니다. `/pr`은 브랜치, 병합 가능 여부, 변경 통계, 리뷰어, 최신 SHA와 Check Run 기반 CI 상태를 보여줍니다.

### `/review` 분석 범위

`/review`는 모든 PR 변경 파일을 페이지 단위로 조회한 뒤, 최대 100개 파일과 10,000개 변경 줄 범위에서 분석합니다. lock·빌드·생성·바이너리 파일은 목록에는 남기되 상세 patch 분석에서 제외합니다. 파일 유형, 변경 성격 추정, 테스트 변경 여부, 비밀정보·위험 코드·파괴적 DB 구문·GitHub Actions 권한·UI·테스트 비활성화 패턴을 규칙 기반으로 표시합니다.

AI 분석이나 실제 컴파일러 분석이 아니므로 결과는 확정된 취약점이 아닌 **검토 필요 신호**입니다. patch가 GitHub에서 제공되지 않거나 PR이 크면 일부만 분석될 수 있으며, 결과만으로 merge를 결정하면 안 됩니다. 비밀정보 의심 문자열은 마스킹하고 GitHub 데이터나 리뷰 댓글을 변경하지 않습니다.

AI 보조 리뷰는 기본적으로 비활성화되어 있습니다. OpenAI 호환 API를 사용하려면 `.env`에 `AI_PROVIDER=openai-compatible`, `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL`을 모두 설정하세요. AI가 켜져도 `/review`의 규칙 기반 분석을 대체하지 않으며, PR의 제한된 patch 일부만 전송합니다. PR 본문과 diff는 신뢰할 수 없는 데이터로 취급하도록 프롬프트에 명시합니다.

## 검증

```bash
npm test
npm run lint
npm run typecheck
npm run build
```

Docker 실행 전 환경 변수를 제공하세요.

```bash
docker build -t discord-github-bot .
docker run --rm --env-file .env discord-github-bot
```

## 보안 및 제한

- `.env`와 토큰은 Git에서 제외됩니다.
- 구조화 로그는 토큰·Authorization 필드를 마스킹합니다.
- 토큰과 내부 오류 세부 정보는 Discord 사용자에게 표시하지 않습니다.
- GitHub 명령은 읽기 API만 호출하며, 쓰기 API·브랜치 생성·push·merge·배포는 구현하지 않았습니다.
- `/review`은 최대 100개 파일, 파일당 50,000 patch 문자, 전체 500,000 patch 문자와 최대 30개 탐지 결과로 제한됩니다.
- GitHub 본문은 요약하고 코드 블록과 Discord 멘션을 안전하게 처리합니다. 모든 GitHub 명령 응답은 Discord 멘션을 허용하지 않습니다.
- GitHub API 요청은 10초 후 중단되며, 사용자별 GitHub 명령에는 3초 쿨다운이 적용됩니다.
- 서버별 설정은 Guild ID로 분리되고, 설정 변경 및 권한 거부는 민감정보를 제외한 감사 로그에 기록됩니다.
- 자동 수정은 이후 단계에서도 사람 승인과 별도 브랜치를 전제로 합니다.

## 문제 해결

- **인증 실패**: `GITHUB_TOKEN`이 올바른지, 만료 또는 폐기되지 않았는지 확인 후 봇을 재시작합니다.
- **저장소 접근 실패**: 토큰의 Resource owner, 선택한 저장소, Read 권한을 확인합니다. 비공개 저장소는 해당 저장소 접근 권한이 있어야 합니다.
- **Rate Limit**: 잠시 기다린 뒤 다시 시도합니다. 봇은 요청을 자동으로 반복하지 않습니다.
- **슬래시 명령어가 보이지 않음**: `npm run register-commands`를 다시 실행합니다. Guild ID가 없으면 전역 명령 반영에 시간이 걸릴 수 있습니다.
- **GitHub 토큰 누락**: `.env`에 `GITHUB_TOKEN`을 설정한 뒤 `npm run dev`를 다시 실행합니다.

## `/review` 수동 검증

1. 테스트용 작은 PR을 만들고 `/review`를 실행합니다.
2. 변경 파일 수와 테스트 변경 여부를 확인합니다.
3. lock 파일과 이미지 파일이 상세 분석에서 제외되는지 확인합니다.
4. 테스트용 위험 패턴 또는 대규모 PR에서 요약과 제한 표시를 확인합니다.

## 다음 단계

PR 변경사항을 규칙 기반으로 요약하는 `/review`를 다음 단계에서 추가할 수 있습니다.

## 실제 Fix 워커 (7단계)

`/fix-issue`의 실제 워커는 기본적으로 비활성화됩니다: `FIX_WORKER_ENABLED=false`, `FIX_PUSH_ENABLED=false`. 빈 `FIX_ALLOWED_REPOSITORIES`는 모든 실제 변경을 차단하며, 목록에는 대소문자를 무시하는 정확한 `owner/repository`만 쉼표로 등록합니다. 읽기 API는 `GITHUB_TOKEN`, 실제 작업은 별도 `GITHUB_WRITE_TOKEN`을 사용합니다. 쓰기 토큰은 DB, 로그, Discord 메시지, remote URL에 저장하지 않습니다.

첫 번째 ADMIN 승인은 UUID 기반 격리 작업 공간의 clone·작업 브랜치·제한된 AI 수정안·범위 검사·`lint/typecheck/test/build` 검증까지만 허용합니다. 두 번째 ADMIN 승인 전에는 commit, push, PR 생성이 없습니다. 비밀정보, HIGH/CRITICAL 위험, 금지 경로, 삭제/lock/workflow/migration/의존성 변경 또는 검증 실패는 중단합니다. 두 번째 승인은 15분 후 만료합니다. Push가 명시적으로 활성화되더라도 새 작업 브랜치 하나만 Draft PR로 제출하며 force push, base branch 직접 push, 자동 merge, 자동 배포는 수행하지 않습니다.

수동 통합 검증은 별도 테스트 GitHub 저장소에서만 수행하세요. allowlist와 테스트 전용 쓰기 토큰을 제한하고 worker만 켠 뒤 1차 승인과 로컬 검증을 확인합니다. 이후 push를 켜서 2차 거절(원격 변경 없음), 2차 승인(Draft PR만 생성), 검증 실패/토큰 누락/허용되지 않은 저장소의 차단을 확인합니다. 운영 환경에서는 별도 non-root 격리 워커와 전용 workspace volume을 사용하고 Docker socket, privileged mode, host filesystem 마운트는 사용하지 마세요.

### 2차 승인 후와 작업 제어

두 번째 ADMIN 승인은 승인 당시의 변경 목록·diff hash·검증 결과와 작업 브랜치를 다시 확인한 뒤에만 진행됩니다. 승인된 파일만 `git add -- <파일>`로 stage하고, `GIT_BOT_NAME`과 `GIT_BOT_EMAIL`로 로컬 저장소 author를 설정해 commit합니다. worker와 push, allowlist, 쓰기 토큰이 모두 유효할 때에만 새 작업 브랜치 하나를 push하고 Draft PR을 생성합니다. 기존 원격 브랜치, 보호 브랜치, force push, tag push는 차단합니다. PR 생성에 실패해도 push된 브랜치는 자동 삭제하지 않습니다.

`/fix-status task-id:<UUID>`는 요청자 또는 ADMIN에게 작업 상태, 검증, commit, PR, 오류와 정리 상태를 ephemeral로 표시합니다. `/fix-cancel task-id:<UUID> [reason:<사유>]`는 ADMIN만 승인·검증·2차 승인 대기 단계의 작업을 취소할 수 있습니다. commit/push/PR 생성 중이거나 완료·실패한 작업은 취소할 수 없으며, 취소는 원격 브랜치를 삭제하지 않습니다.
