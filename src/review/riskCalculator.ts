import type { RiskLevel, ReviewFinding } from './types.js';

export function calculateRisk(
  findings: ReviewFinding[],
  partialAnalysis: boolean,
  changedLines: number,
  testsChanged: boolean,
): RiskLevel {
  if (findings.some((finding) => finding.severity === 'CRITICAL')) return 'CRITICAL';
  if (findings.some((finding) => finding.severity === 'HIGH')) return 'HIGH';
  if (
    partialAnalysis ||
    (!testsChanged && changedLines > 500) ||
    findings.some((finding) => finding.severity === 'MEDIUM')
  )
    return 'MEDIUM';
  return 'LOW';
}
