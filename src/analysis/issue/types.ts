export type Confidence = 'LOW' | 'MEDIUM' | 'HIGH';
export interface RelatedFileCandidate {
  path: string;
  relevance: Confidence;
  reasons: string[];
  contentAnalyzed: boolean;
  excludedReason?: string;
}
export interface RelatedPullRequest {
  number: number;
  title: string;
  state: string;
  url: string;
  relationReason: string;
  confidence: Confidence;
}
export interface CauseCandidate {
  title: string;
  description: string;
  relatedFiles: string[];
  evidence: string[];
  confidence: Confidence;
  verificationSteps: string[];
  suggestedResolution: string;
}
export interface FixPlanStep {
  order: number;
  title: string;
  description: string;
  targetFiles: string[];
  risk: Confidence;
  verification: string[];
}
export interface IssueAnalysisResult {
  repository: string;
  issueNumber: number;
  title: string;
  state: string;
  url: string;
  author: string;
  labels: string[];
  issueTypes: string[];
  confirmedFacts: string[];
  assumptions: string[];
  reproductionSteps: string[];
  expectedBehavior?: string;
  actualBehavior?: string;
  relatedFiles: RelatedFileCandidate[];
  relatedPullRequests: RelatedPullRequest[];
  causeCandidates: CauseCandidate[];
  fixPlan: FixPlanStep[];
  tests: string[];
  additionalQuestions: string[];
  partialAnalysis: boolean;
  limitations: string[];
  commentsAnalyzed: number;
  totalComments: number;
  aiUsed: boolean;
  aiFailed: boolean;
  aiSummary?: string;
}
