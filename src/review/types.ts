export type ReviewSeverity = 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type ReviewConfidence = 'LOW' | 'MEDIUM' | 'HIGH';
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface ReviewFinding {
  id: string;
  severity: ReviewSeverity;
  category: string;
  file: string;
  line?: number;
  title: string;
  description: string;
  evidence?: string;
  recommendation: string;
  confidence: ReviewConfidence;
}

export interface ChangedFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
  previousFilename?: string;
}

export interface FileReviewSummary extends ChangedFile {
  categories: string[];
  excluded: boolean;
  exclusionReason?: string;
  findings: ReviewFinding[];
}

export interface PullRequestReviewResult {
  pullRequestNumber: number;
  title: string;
  author: string;
  htmlUrl: string;
  baseBranch: string;
  headBranch: string;
  additions: number;
  deletions: number;
  totalFiles: number;
  analyzedFiles: number;
  excludedFiles: number;
  testsChanged: boolean;
  partialAnalysis: boolean;
  changeTypes: string[];
  riskLevel: RiskLevel;
  findings: ReviewFinding[];
  files: FileReviewSummary[];
  aiReview?: {
    summary: string;
    risk: RiskLevel;
    concerns: Array<{ severity: RiskLevel; file?: string; title: string; description: string }>;
  };
}
