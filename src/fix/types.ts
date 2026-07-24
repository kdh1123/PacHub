export const FIX_STATUSES = [
  'PENDING_ANALYSIS',
  'ANALYZING',
  'WAITING_APPROVAL',
  'APPROVED',
  'PREPARING_WORKSPACE',
  'CLONING',
  'CHECKING_OUT_BASE',
  'CREATING_BRANCH',
  'GENERATING_PATCH',
  'APPLYING_PATCH',
  'VALIDATING_SCOPE',
  'RUNNING_CHECKS',
  'ANALYZING_DIFF',
  'WAITING_SECOND_APPROVAL',
  'SECOND_APPROVED',
  'SECOND_REJECTED',
  'COMMITTING',
  'PUSHING',
  'CREATING_PR',
  'COMPLETED',
  'REJECTED',
  'EXPIRED',
  'FAILED',
  'CANCELLED',
  'CLEANING_UP',
] as const;
export type FixStatus = (typeof FIX_STATUSES)[number];
export type FixEligibility = 'ALLOWED' | 'REQUIRES_MANUAL_WORK' | 'BLOCKED';
export interface ValidationResult {
  commandName: string;
  success: boolean;
  exitCode: number | null;
  timedOut: boolean;
  durationMs: number;
  stdoutSummary: string;
  stderrSummary: string;
}
export interface DiffSummary {
  changedFiles: string[];
  additions: number;
  deletions: number;
  risk: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  warnings: string[];
  approvalHash: string;
}
export interface FixTask {
  id: string;
  guildId: string;
  channelId: string;
  requestedByUserId: string;
  approvedByUserId?: string;
  secondApprovedByUserId?: string;
  owner: string;
  repository: string;
  issueNumber: number;
  issueTitle: string;
  baseBranch: string;
  workBranch: string;
  useAi: boolean;
  dryRun: boolean;
  status: FixStatus;
  plannedFiles: string[];
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  eligibility: FixEligibility;
  createdAt: string;
  expiresAt: string;
  updatedAt: string;
  workspacePathHash?: string;
  headShaAtAnalysis?: string;
  headShaAtExecution?: string;
  baseBranchSha?: string;
  workerStartedAt?: string;
  validationStartedAt?: string;
  validationCompletedAt?: string;
  secondApprovalRequestedAt?: string;
  secondApprovalExpiresAt?: string;
  secondApprovedAt?: string;
  changedFiles?: string[];
  validationResults?: ValidationResult[];
  diffSummary?: DiffSummary;
  commitSha?: string;
  pullRequestNumber?: number;
  pullRequestUrl?: string;
  committedAt?: string;
  pushedAt?: string;
  remoteBranch?: string;
  pushSucceeded?: string;
  pullRequestDraft?: string;
  completedAt?: string;
  cancelReason?: string;
  cleanupStatus?: string;
  failureStage?: string;
  errorCode?: string;
  errorSummary?: string;
}
export interface FileModification {
  path: string;
  operation: 'UPDATE' | 'CREATE';
  expectedOriginalHash?: string;
  content: string;
}
export interface CodeModificationInput {
  taskId: string;
  repository: string;
  issueNumber: number;
  issueTitle: string;
  issueSummary: string;
  confirmedFacts: string[];
  allowedFiles: string[];
  forbiddenPaths: string[];
  repositoryFiles: { path: string; content: string }[];
  constraints: string[];
}
export interface CodeModificationResult {
  summary: string;
  modifications: FileModification[];
  warnings: string[];
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
}
export interface CodeModificationAgent {
  generateModification(input: CodeModificationInput): Promise<CodeModificationResult>;
}
export interface FixWorkerResult {
  taskId: string;
  status: FixStatus;
  changedFiles: string[];
  validationPassed: boolean;
  secondApprovalRequired: boolean;
  pullRequestUrl?: string;
  warnings: string[];
}
export interface FixTaskWorker {
  executeApprovedTask(taskId: string): Promise<FixWorkerResult>;
  resumeAfterSecondApproval(taskId: string): Promise<FixWorkerResult>;
  cancelTask(taskId: string): Promise<void>;
}
export const transitions: Partial<Record<FixStatus, FixStatus[]>> = {
  PENDING_ANALYSIS: ['ANALYZING', 'FAILED'],
  ANALYZING: ['WAITING_APPROVAL', 'FAILED'],
  WAITING_APPROVAL: ['APPROVED', 'REJECTED', 'EXPIRED', 'CANCELLED'],
  APPROVED: ['PREPARING_WORKSPACE', 'CANCELLED', 'FAILED'],
  PREPARING_WORKSPACE: ['CLONING', 'FAILED', 'CANCELLED'],
  CLONING: ['CHECKING_OUT_BASE', 'FAILED', 'CANCELLED'],
  CHECKING_OUT_BASE: ['CREATING_BRANCH', 'FAILED', 'CANCELLED'],
  CREATING_BRANCH: ['GENERATING_PATCH', 'FAILED', 'CANCELLED'],
  GENERATING_PATCH: ['APPLYING_PATCH', 'FAILED', 'CANCELLED'],
  APPLYING_PATCH: ['VALIDATING_SCOPE', 'FAILED', 'CANCELLED'],
  VALIDATING_SCOPE: ['RUNNING_CHECKS', 'FAILED', 'CANCELLED'],
  RUNNING_CHECKS: ['ANALYZING_DIFF', 'FAILED', 'CANCELLED'],
  ANALYZING_DIFF: ['WAITING_SECOND_APPROVAL', 'FAILED', 'CANCELLED'],
  WAITING_SECOND_APPROVAL: ['SECOND_APPROVED', 'SECOND_REJECTED', 'EXPIRED', 'CANCELLED'],
  SECOND_APPROVED: ['COMMITTING', 'FAILED'],
  SECOND_REJECTED: ['CLEANING_UP'],
  EXPIRED: ['CLEANING_UP'],
  CANCELLED: ['CLEANING_UP'],
  CLEANING_UP: ['CANCELLED', 'COMPLETED', 'FAILED'],
  COMMITTING: ['PUSHING', 'FAILED'],
  PUSHING: ['CREATING_PR', 'FAILED'],
  CREATING_PR: ['COMPLETED', 'FAILED'],
};
export function canTransition(from: FixStatus, to: FixStatus): boolean {
  return transitions[from]?.includes(to) ?? false;
}
export function workBranch(issueNumber: number, title: string, suffix: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 36);
  return `fix/issue-${issueNumber}${slug ? `-${slug}` : ''}-${suffix.slice(0, 6).toLowerCase()}`;
}
