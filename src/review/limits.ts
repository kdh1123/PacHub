export const REVIEW_LIMITS = {
  maxFiles: 100,
  maxChangedLines: 10_000,
  maxTotalPatchCharacters: 500_000,
  maxPatchCharactersPerFile: 50_000,
  maxFindingsPerFile: 10,
  maxFindings: 30,
  maxAnalysisMilliseconds: 10_000,
} as const;
