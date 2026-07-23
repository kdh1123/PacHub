# Discord GitHub Collaboration Bot

Discord에서 개발 협업을 돕는 GitHub 봇입니다. 현재는 **2단계**로, Discord 상태와 GitHub 읽기 정보를 제공합니다. AI 리뷰, 코드 변경, Pull Request 생성은 아직 구현하지 않았습니다.

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

예를 들어 `/repo owner:octocat repository:Hello-World`처럼 GitHub URL이 아닌 소유자와 저장소 이름만 입력합니다. `.git` 접미사는 허용되며 제거됩니다. `/issue`는 본문 요약, 담당자, 라벨, 마일스톤, 댓글 수를 표시하며 PR 번호를 입력하면 `/pr` 사용을 안내합니다. `/pr`은 브랜치, 병합 가능 여부, 변경 통계, 리뷰어, 최신 SHA와 Check Run 기반 CI 상태를 보여줍니다.

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
- GitHub 본문은 요약하고 코드 블록과 Discord 멘션을 안전하게 처리합니다. 모든 GitHub 명령 응답은 Discord 멘션을 허용하지 않습니다.
- GitHub API 요청은 10초 후 중단되며, 사용자별 GitHub 명령에는 3초 쿨다운이 적용됩니다.
- 자동 수정은 이후 단계에서도 사람 승인과 별도 브랜치를 전제로 합니다.

## 문제 해결

- **인증 실패**: `GITHUB_TOKEN`이 올바른지, 만료 또는 폐기되지 않았는지 확인 후 봇을 재시작합니다.
- **저장소 접근 실패**: 토큰의 Resource owner, 선택한 저장소, Read 권한을 확인합니다. 비공개 저장소는 해당 저장소 접근 권한이 있어야 합니다.
- **Rate Limit**: 잠시 기다린 뒤 다시 시도합니다. 봇은 요청을 자동으로 반복하지 않습니다.
- **슬래시 명령어가 보이지 않음**: `npm run register-commands`를 다시 실행합니다. Guild ID가 없으면 전역 명령 반영에 시간이 걸릴 수 있습니다.
- **GitHub 토큰 누락**: `.env`에 `GITHUB_TOKEN`을 설정한 뒤 `npm run dev`를 다시 실행합니다.

## 다음 단계

PR 변경사항을 규칙 기반으로 요약하는 `/review`를 다음 단계에서 추가할 수 있습니다.
