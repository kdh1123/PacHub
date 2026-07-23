import type { Octokit } from '@octokit/rest';
import type { AiProvider } from '../../ai/provider.js';
import type { NumberedRepositoryInput } from '../../github/input.js';
import { getIssue } from '../../github/issues.js';
import { getExclusionReason } from '../../review/fileClassifier.js';
import { extractIssueData } from './parser.js';
import type {
  CauseCandidate,
  IssueAnalysisResult,
  RelatedFileCandidate,
  RelatedPullRequest,
} from './types.js';

const LIMITS = {
  comments: 100,
  commentChars: 10_000,
  totalCommentChars: 150_000,
  events: 100,
  files: 20,
  fileChars: 30_000,
  totalCodeChars: 200_000,
  prs: 20,
};
async function listComments(client: Octokit, input: NumberedRepositoryInput) {
  const comments: Array<{ body: string; user?: { type?: string } | null }> = [];
  let partial = false;
  let totalChars = 0;
  for (let page = 1; comments.length < LIMITS.comments; page += 1) {
    const { data } = await client.rest.issues.listComments({
      owner: input.owner,
      repo: input.repository,
      issue_number: input.number,
      per_page: 30,
      page,
    });
    for (const comment of data) {
      if (comments.length >= LIMITS.comments || totalChars >= LIMITS.totalCommentChars) {
        partial = true;
        break;
      }
      const body = (comment.body ?? '').slice(0, LIMITS.commentChars);
      comments.push({ body, user: comment.user });
      totalChars += body.length;
      if ((comment.body ?? '').length > body.length) partial = true;
    }
    if (data.length < 30) break;
  }
  return { comments, partial };
}
async function findRelatedPullRequests(
  client: Octokit,
  input: NumberedRepositoryInput,
  text: string,
): Promise<RelatedPullRequest[]> {
  const found = new Map<number, RelatedPullRequest>();
  const add = (
    number: number,
    title = `Pull Request #${number}`,
    url = `https://github.com/${input.owner}/${input.repository}/pull/${number}`,
    reason = '이슈 텍스트의 PR 참조',
    confidence: 'LOW' | 'MEDIUM' | 'HIGH' = 'MEDIUM',
  ) =>
    found.set(number, { number, title, state: 'unknown', url, relationReason: reason, confidence });
  for (const match of text.matchAll(
    new RegExp(`https://github\\.com/${input.owner}/${input.repository}/pull/(\\d+)`, 'gi'),
  ))
    add(Number(match[1]), undefined, match[0], '이슈 또는 댓글의 명시적 PR 링크', 'HIGH');
  try {
    const { data } = await client.rest.search.issuesAndPullRequests({
      q: `repo:${input.owner}/${input.repository} is:pr ${input.number}`,
      per_page: LIMITS.prs,
    });
    for (const item of data.items)
      if (
        item.body &&
        new RegExp(`(?:fixes|closes|resolves)\\s+#${input.number}\\b`, 'i').test(item.body)
      )
        add(item.number, item.title, item.html_url, 'PR 본문의 이슈 해결 참조', 'HIGH');
  } catch {
    /* search is an optional enhancement */
  }
  try {
    const response = await client.request(
      'GET /repos/{owner}/{repo}/issues/{issue_number}/timeline',
      {
        owner: input.owner,
        repo: input.repository,
        issue_number: input.number,
        per_page: LIMITS.events,
        headers: { accept: 'application/vnd.github+json' },
      },
    );
    for (const event of response.data as Array<Record<string, unknown>>) {
      const source = event.source as
        | {
            issue?: {
              pull_request?: { url?: string };
              number?: number;
              title?: string;
              html_url?: string;
            };
          }
        | undefined;
      const pr = source?.issue;
      if (pr?.pull_request && pr.number)
        add(pr.number, pr.title, pr.html_url, 'GitHub timeline cross-reference', 'HIGH');
    }
  } catch {
    /* timeline is optional */
  }
  return [...found.values()].slice(0, LIMITS.prs);
}
async function findFiles(
  client: Octokit,
  input: NumberedRepositoryInput,
  extracted: ReturnType<typeof extractIssueData>,
  prs: RelatedPullRequest[],
): Promise<{ files: RelatedFileCandidate[]; partial: boolean }> {
  const candidates = new Map<string, RelatedFileCandidate>();
  for (const path of extracted.paths)
    candidates.set(path, {
      path,
      relevance: 'HIGH',
      reasons: ['이슈에 명시된 파일 경로'],
      contentAnalyzed: false,
    });
  for (const pr of prs) {
    try {
      const { data } = await client.rest.pulls.listFiles({
        owner: input.owner,
        repo: input.repository,
        pull_number: pr.number,
        per_page: 30,
      });
      for (const file of data.slice(0, LIMITS.files))
        if (!candidates.has(file.filename))
          candidates.set(file.filename, {
            path: file.filename,
            relevance: 'MEDIUM',
            reasons: ['연결된 PR 변경 파일'],
            contentAnalyzed: false,
          });
    } catch {
      /* individual PR lookup is best effort */
    }
  }
  if (candidates.size === 0) {
    const query = extracted.apiPaths[0] ?? extracted.errors[0];
    if (query) {
      try {
        const response = await client.request('GET /search/code', {
          q: `${query} repo:${input.owner}/${input.repository}`,
          per_page: LIMITS.files,
        });
        for (const item of (response.data as { items?: Array<{ path?: string }> }).items ?? [])
          if (item.path)
            candidates.set(item.path, {
              path: item.path,
              relevance: 'LOW',
              reasons: ['제한된 GitHub Code Search 일치'],
              contentAnalyzed: false,
            });
      } catch {
        /* direct paths and PR files remain the safe fallback */
      }
    }
  }
  const files = [...candidates.values()].slice(0, LIMITS.files);
  let total = 0;
  for (const file of files.slice(0, 10)) {
    const excluded = getExclusionReason(file.path);
    if (excluded) {
      file.excludedReason = excluded;
      continue;
    }
    try {
      const { data } = await client.rest.repos.getContent({
        owner: input.owner,
        repo: input.repository,
        path: file.path,
      });
      if (!Array.isArray(data) && data.type === 'file' && typeof data.content === 'string') {
        const content = Buffer.from(data.content, 'base64')
          .toString('utf8')
          .slice(0, LIMITS.fileChars);
        total += content.length;
        file.contentAnalyzed = total <= LIMITS.totalCodeChars;
        if (!file.contentAnalyzed) file.excludedReason = '전체 코드 분석 제한';
      }
    } catch {
      file.excludedReason = '파일 내용 조회 실패 또는 접근 불가';
    }
  }
  return { files, partial: candidates.size > files.length || total > LIMITS.totalCodeChars };
}
function analyze(
  title: string,
  text: string,
  files: RelatedFileCandidate[],
  extracted: ReturnType<typeof extractIssueData>,
) {
  const lower = `${title}\n${text}`.toLowerCase();
  const types: string[] = [];
  const facts: string[] = [];
  if (/css|layout|ui|화면|정렬|렌더/.test(lower)) types.push('UI / Layout');
  if (/api|http|endpoint|\/api\//.test(lower)) types.push('API');
  if (/auth|권한|permission|forbidden|401|403/.test(lower)) types.push('Authorization');
  if (/database|db|migration|sql/.test(lower)) types.push('Database');
  if (/config|env|환경 변수/.test(lower)) types.push('Configuration');
  if (!types.length) types.push('Unknown');
  if (extracted.errors.length) facts.push(`오류 단서: ${extracted.errors.join(', ')}`);
  if (extracted.environments.length) facts.push(`환경: ${extracted.environments.join(', ')}`);
  if (extracted.paths.length) facts.push(`언급된 파일 경로: ${extracted.paths.join(', ')}`);
  const causes: CauseCandidate[] = [];
  if (/null|undefined|cannot read/.test(lower))
    causes.push({
      title: 'null 또는 undefined 처리 누락 가능성',
      description: '이슈 텍스트에 null/undefined 관련 단서가 있습니다.',
      relatedFiles: files
        .filter((f) => f.contentAnalyzed)
        .map((f) => f.path)
        .slice(0, 3),
      evidence: extracted.errors,
      confidence: 'MEDIUM',
      verificationSteps: ['입력값과 API 응답의 nullable 필드를 확인합니다.'],
      suggestedResolution: '값 사용 전 명시적 null 처리와 테스트를 검토합니다.',
    });
  if (/401|403|permission|권한|auth/.test(lower))
    causes.push({
      title: '권한 검사 또는 인증 설정 불일치 가능성',
      description: '인증·권한 관련 표현이 확인됩니다.',
      relatedFiles: files.map((f) => f.path).slice(0, 3),
      evidence: ['이슈의 인증 또는 권한 키워드'],
      confidence: 'MEDIUM',
      verificationSteps: ['요청 주체와 필요한 권한을 비교합니다.'],
      suggestedResolution: '권한 정책과 오류 응답 매핑을 확인합니다.',
    });
  if (/windows|macos|chrome|safari|css|layout/.test(lower))
    causes.push({
      title: '환경 또는 렌더링 차이 가능성',
      description: '브라우저·OS·레이아웃 단서가 있습니다.',
      relatedFiles: files.map((f) => f.path).slice(0, 3),
      evidence: extracted.environments,
      confidence: 'LOW',
      verificationSteps: ['문제가 보고된 환경에서 동일한 재현 절차를 수행합니다.'],
      suggestedResolution: 'CSS/레이아웃 조건과 브라우저 차이를 점검합니다.',
    });
  if (!causes.length && files.length)
    causes.push({
      title: '관련 코드 확인 필요',
      description: '명시된 파일 후보는 있지만 원인을 확정할 근거가 부족합니다.',
      relatedFiles: files.map((f) => f.path).slice(0, 3),
      evidence: ['이슈 텍스트와 파일 후보의 제한된 연관성'],
      confidence: 'LOW',
      verificationSteps: ['파일의 관련 함수와 재현 절차를 확인합니다.'],
      suggestedResolution: '최소 재현 정보 후 해당 파일의 입력·출력 경로를 조사합니다.',
    });
  return { types, facts, causes: causes.slice(0, 5) };
}
export async function analyzeIssue(
  client: Octokit,
  input: NumberedRepositoryInput,
  aiProvider?: AiProvider,
  useAi = false,
): Promise<IssueAnalysisResult> {
  const issue = await getIssue(client, input);
  const body = (issue.body ?? '').slice(0, 12_000);
  const commentsResult = await listComments(client, input);
  const commentText = commentsResult.comments
    .filter((comment) => comment.user?.type !== 'Bot')
    .map((comment) => comment.body)
    .join('\n')
    .slice(0, 20_000);
  const combined = `${issue.title}\n${body}\n${commentText}`;
  const extracted = extractIssueData(combined);
  const prs = await findRelatedPullRequests(client, input, combined);
  const fileResult = await findFiles(client, input, extracted, prs);
  const rule = analyze(issue.title, combined, fileResult.files, extracted);
  let aiSummary: string | undefined;
  let aiFailed = false;
  if (useAi && aiProvider?.isConfigured) {
    try {
      const ai = await aiProvider.analyzeIssue?.({
        title: issue.title,
        body,
        comments: commentText,
        files: fileResult.files.map((file) => file.path),
        causes: rule.causes,
      });
      aiSummary = ai?.summary;
    } catch {
      aiFailed = true;
    }
  }
  const limitations = [];
  if (commentsResult.partial) limitations.push('댓글 일부만 분석됨');
  if (fileResult.partial) limitations.push('관련 파일 또는 코드 분석 제한 적용');
  if (!prs.length) limitations.push('Timeline 확인 불가 또는 연결된 PR을 찾지 못함');
  if (aiFailed) limitations.push('AI 보조 분석에 실패하여 규칙 기반 결과만 제공');
  return {
    repository: `${input.owner}/${input.repository}`,
    issueNumber: issue.number,
    title: issue.title,
    state: issue.state,
    url: issue.html_url,
    author: issue.user?.login ?? '알 수 없음',
    labels: issue.labels
      .map((label) => (typeof label === 'string' ? label : (label.name ?? '')))
      .filter(Boolean),
    issueTypes: rule.types,
    confirmedFacts: rule.facts,
    assumptions: rule.causes.map((cause) => cause.title),
    reproductionSteps: extracted.reproductionSteps,
    expectedBehavior: extracted.expected,
    actualBehavior: extracted.actual,
    relatedFiles: fileResult.files,
    relatedPullRequests: prs,
    causeCandidates: rule.causes,
    fixPlan: rule.causes.map((cause, index) => ({
      order: index + 1,
      title: cause.title,
      description: cause.suggestedResolution,
      targetFiles: cause.relatedFiles,
      risk: cause.confidence,
      verification: cause.verificationSteps,
    })),
    tests: rule.causes.length
      ? [
          '문제 재현 조건을 단위 또는 통합 테스트로 고정합니다.',
          '수정 전후의 정상 경로와 오류 경로를 비교합니다.',
        ]
      : ['정확한 재현 절차를 확보한 뒤 회귀 테스트를 추가합니다.'],
    additionalQuestions: extracted.reproductionSteps.length
      ? []
      : [
          '정확한 재현 절차와 기대·실제 결과를 알려주세요.',
          '오류 로그 또는 스택 트레이스 일부가 있으면 제공해 주세요.',
        ],
    partialAnalysis: commentsResult.partial || fileResult.partial,
    limitations,
    commentsAnalyzed: commentsResult.comments.length,
    totalComments: issue.comments,
    aiUsed: Boolean(aiSummary),
    aiFailed,
    aiSummary,
  };
}
