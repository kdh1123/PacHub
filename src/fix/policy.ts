import type { IssueAnalysisResult } from '../analysis/issue/types.js';
import type { FixEligibility } from './types.js';
const forbidden = [
  '.github/workflows/',
  '.env',
  'package.json',
  'package-lock',
  'migration',
  'dockerfile',
  'auth',
  'permission',
];
export function assessFix(analysis: IssueAnalysisResult): {
  eligibility: FixEligibility;
  risk: 'LOW' | 'MEDIUM' | 'HIGH';
  reasons: string[];
  allowedFiles: string[];
} {
  const files = analysis.relatedFiles
    .filter((file) => file.relevance === 'HIGH' && !file.excludedReason)
    .map((file) => file.path);
  const reasons = [];
  if (!files.length) reasons.push('HIGH 관련 파일 후보가 없습니다.');
  if (analysis.causeCandidates.every((cause) => cause.confidence === 'LOW'))
    reasons.push('원인 후보 신뢰도가 낮습니다.');
  if (files.some((file) => forbidden.some((part) => file.toLowerCase().includes(part))))
    reasons.push('인증·환경·의존성·배포 관련 파일은 자동 수정 대상이 아닙니다.');
  const risk = reasons.length
    ? 'HIGH'
    : analysis.causeCandidates.some((cause) => cause.confidence === 'MEDIUM')
      ? 'MEDIUM'
      : 'LOW';
  return {
    eligibility:
      risk === 'HIGH' ? 'BLOCKED' : risk === 'MEDIUM' ? 'REQUIRES_MANUAL_WORK' : 'ALLOWED',
    risk,
    reasons,
    allowedFiles: files.slice(0, 10),
  };
}
export function isForbiddenPath(path: string): boolean {
  return [
    '.git/',
    '.github/workflows/',
    'node_modules/',
    'dist/',
    'build/',
    'coverage/',
    '.env',
    'package-lock',
    'yarn.lock',
    'pnpm-lock',
    'migration',
  ].some((value) => path.toLowerCase().includes(value));
}
