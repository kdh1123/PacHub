import type { Octokit } from '@octokit/rest';

import type { NumberedRepositoryInput } from '../github/input.js';
import type { AiProvider } from '../ai/provider.js';
import { REVIEW_LIMITS } from './limits.js';
import { classifyFile, getExclusionReason, isTestFile } from './fileClassifier.js';
import { calculateRisk } from './riskCalculator.js';
import { analyzeFileRules } from './rules.js';
import type { ChangedFile, PullRequestReviewResult, ReviewFinding } from './types.js';

function toChangedFile(file: {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
  previous_filename?: string;
}): ChangedFile {
  return {
    filename: file.filename,
    status: file.status,
    additions: file.additions,
    deletions: file.deletions,
    changes: file.changes,
    patch: file.patch,
    previousFilename: file.previous_filename,
  };
}

function inferChangeTypes(files: PullRequestReviewResult['files'], title: string): string[] {
  const types = new Set<string>();
  const categories = files.flatMap((file) => file.categories);
  if (categories.includes('Test')) types.add('Test');
  if (categories.includes('Documentation')) types.add('Documentation');
  if (categories.includes('Dependency')) types.add('Dependency Update');
  if (categories.includes('Migration')) types.add('Database Change');
  if (categories.includes('Infrastructure')) types.add('Infrastructure Change');
  if (categories.includes('CI/CD')) types.add('CI/CD Change');
  if (/fix|bug/i.test(title)) types.add('Bug Fix');
  if (/refactor/i.test(title)) types.add('Refactor');
  if (/feat|feature/i.test(title)) types.add('Feature');
  if (types.size === 0) types.add('Mixed Change');
  return [...types];
}

export async function reviewPullRequest(
  client: Octokit,
  input: NumberedRepositoryInput,
  aiProvider?: AiProvider,
): Promise<PullRequestReviewResult> {
  const startedAt = Date.now();
  const { data: pullRequest } = await client.rest.pulls.get({
    owner: input.owner,
    repo: input.repository,
    pull_number: input.number,
  });
  const changedFiles: ChangedFile[] = [];
  let partialAnalysis = false;

  for (let page = 1; changedFiles.length < REVIEW_LIMITS.maxFiles; page += 1) {
    if (Date.now() - startedAt > REVIEW_LIMITS.maxAnalysisMilliseconds) {
      partialAnalysis = true;
      break;
    }
    const { data } = await client.rest.pulls.listFiles({
      owner: input.owner,
      repo: input.repository,
      pull_number: input.number,
      per_page: 30,
      page,
    });
    changedFiles.push(
      ...data.slice(0, REVIEW_LIMITS.maxFiles - changedFiles.length).map(toChangedFile),
    );
    if (data.length < 30) break;
    if (changedFiles.length >= REVIEW_LIMITS.maxFiles) partialAnalysis = true;
  }
  if (pullRequest.changed_files > changedFiles.length) partialAnalysis = true;

  let totalPatchCharacters = 0;
  let totalChangedLines = 0;
  const findings: ReviewFinding[] = [];
  const files = changedFiles.map((file) => {
    const exclusionReason = getExclusionReason(file.filename);
    const categories = classifyFile(file.filename);
    const patchTooLarge = (file.patch?.length ?? 0) > REVIEW_LIMITS.maxPatchCharactersPerFile;
    totalChangedLines += file.changes;
    totalPatchCharacters += file.patch?.length ?? 0;
    const excluded = Boolean(
      exclusionReason ||
      patchTooLarge ||
      totalChangedLines > REVIEW_LIMITS.maxChangedLines ||
      totalPatchCharacters > REVIEW_LIMITS.maxTotalPatchCharacters,
    );
    if (excluded && !exclusionReason) partialAnalysis = true;
    const fileFindings = excluded
      ? []
      : analyzeFileRules(file).slice(0, REVIEW_LIMITS.maxFindingsPerFile);
    findings.push(...fileFindings);
    return {
      ...file,
      categories,
      excluded,
      exclusionReason: exclusionReason ?? (excluded ? '분석 제한 초과' : undefined),
      findings: fileFindings,
    };
  });

  const cappedFindings = findings.slice(0, REVIEW_LIMITS.maxFindings);
  if (findings.length > cappedFindings.length) partialAnalysis = true;
  const testsChanged = files.some((file) => isTestFile(file.filename));
  const manifestChanged = files.some((file) => file.filename === 'package.json');
  const lockChanged = files.some((file) =>
    /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml)$/.test(file.filename),
  );
  if (manifestChanged && !lockChanged)
    cappedFindings.push({
      id: 'manifest-without-lock',
      severity: 'MEDIUM',
      category: 'Dependency',
      file: 'package.json',
      title: '의존성 manifest 변경과 lock 파일 불일치',
      description: 'package.json은 변경됐지만 lock 파일 변경이 확인되지 않았습니다.',
      recommendation: '의존성 변경 의도와 재현 가능한 설치 결과를 확인하세요.',
      confidence: 'MEDIUM',
    });
  if (!testsChanged && files.some((file) => file.categories.includes('Source Code')))
    cappedFindings.push({
      id: 'tests-not-changed',
      severity: 'LOW',
      category: 'Test',
      file: 'PR',
      title: '테스트 추가 검토 필요',
      description: '소스 파일 변경은 있지만 테스트 파일 변경이 확인되지 않았습니다.',
      recommendation: '변경 성격에 맞는 테스트가 필요한지 검토하세요.',
      confidence: 'LOW',
    });

  const additions = changedFiles.reduce((sum, file) => sum + file.additions, 0);
  const deletions = changedFiles.reduce((sum, file) => sum + file.deletions, 0);
  const resultBase = {
    pullRequestNumber: pullRequest.number,
    title: pullRequest.title,
    author: pullRequest.user?.login ?? '알 수 없음',
    htmlUrl: pullRequest.html_url,
    baseBranch: pullRequest.base.ref,
    headBranch: pullRequest.head.ref,
    additions,
    deletions,
    totalFiles: pullRequest.changed_files,
    analyzedFiles: files.filter((file) => !file.excluded).length,
    excludedFiles: files.filter((file) => file.excluded).length,
    testsChanged,
    partialAnalysis,
    findings: cappedFindings,
    files,
  };
  const result: PullRequestReviewResult = {
    ...resultBase,
    changeTypes: inferChangeTypes(files, pullRequest.title),
    riskLevel: calculateRisk(cappedFindings, partialAnalysis, additions + deletions, testsChanged),
  };
  if (aiProvider?.isConfigured) {
    result.aiReview = await aiProvider.reviewCode({
      title: pullRequest.title,
      description: pullRequest.body ?? '',
      files: files
        .filter((file) => !file.excluded)
        .slice(0, 20)
        .map((file) => ({ filename: file.filename, patch: file.patch?.slice(0, 10_000) })),
    });
  }
  return result;
}
