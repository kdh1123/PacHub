const take = (value: string, max = 1_000) =>
  value
    .replace(/@/g, '@\u200b')
    .replace(/```[\s\S]*?```/g, '[코드 블록]')
    .slice(0, max);
export interface ExtractedIssueData {
  paths: string[];
  errors: string[];
  environments: string[];
  reproductionSteps: string[];
  expected?: string;
  actual?: string;
  apiPaths: string[];
}
export function extractIssueData(text: string): ExtractedIssueData {
  const paths = [
    ...new Set(
      text.match(
        /(?:[\w.-]+\/)+[\w.-]+\.(?:ts|tsx|js|jsx|py|java|go|rb|cs|css|html|json|yml|yaml)/g,
      ) ?? [],
    ),
  ].slice(0, 20);
  const errors = [
    ...new Set(text.match(/(?:\b\w*(?:Error|Exception)\b|HTTP\s?\d{3}|\b[45]\d{2}\b)/g) ?? []),
  ].slice(0, 10);
  const environments = [
    ...new Set(
      text.match(
        /\b(?:Windows|macOS|Linux|Chrome|Firefox|Safari|Node(?:\.js)?\s*\d+(?:\.\d+)*)\b/gi,
      ) ?? [],
    ),
  ].slice(0, 10);
  const apiPaths = [...new Set(text.match(/\/(?:[\w.-]+\/)*[\w.-]+/g) ?? [])]
    .filter((path) => !paths.includes(path))
    .slice(0, 10);
  const section = (names: string[]) => {
    const match = text.match(new RegExp(`(?:${names.join('|')})\\s*[:：]\\s*([^\\n]+)`, 'i'));
    return match?.[1]?.trim();
  };
  const expected = section(['expected', '기대 결과', 'expected result']);
  const actual = section(['actual', 'actual result', '실제 결과']);
  const reproductionSteps = (
    text.match(/(?:steps? to reproduce|재현 (?:절차|방법))\s*[:：]?\s*([\s\S]{0,700})/i)?.[1] ?? ''
  )
    .split('\n')
    .map((line) => line.replace(/^\s*(?:\d+[.)]|[-*])\s*/, '').trim())
    .filter(Boolean)
    .slice(0, 5);
  return {
    paths,
    errors,
    environments,
    reproductionSteps,
    expected: expected && take(expected),
    actual: actual && take(actual),
    apiPaths,
  };
}
