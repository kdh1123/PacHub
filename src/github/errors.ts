export type GitHubErrorKind =
  'authentication' | 'notFoundOrForbidden' | 'rateLimit' | 'network' | 'unknown';

export function classifyGitHubError(error: unknown): GitHubErrorKind {
  if (typeof error !== 'object' || error === null) return 'unknown';

  const candidate = error as {
    status?: number;
    code?: string;
    response?: { headers?: Record<string, string> };
  };
  if (candidate.status === 401) return 'authentication';
  if (candidate.status === 403 || candidate.status === 404) {
    if (candidate.response?.headers?.['x-ratelimit-remaining'] === '0') return 'rateLimit';
    return 'notFoundOrForbidden';
  }
  if (candidate.status === 429) return 'rateLimit';
  if (
    candidate.code &&
    ['ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT'].includes(candidate.code)
  )
    return 'network';
  return 'unknown';
}

export function toGitHubUserMessage(error: unknown): string {
  switch (classifyGitHubError(error)) {
    case 'authentication':
      return 'GitHub 인증에 실패했습니다. 관리자에게 GitHub 인증 설정을 확인해 달라고 요청해 주세요.';
    case 'notFoundOrForbidden':
      return '저장소 또는 항목을 찾을 수 없거나 접근 권한이 없습니다. 저장소 이름과 GitHub 인증 권한을 확인해 주세요.';
    case 'rateLimit':
      return 'GitHub API 요청 한도를 초과했습니다. 잠시 후 다시 시도해 주세요.';
    case 'network':
      return 'GitHub와 통신하는 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.';
    default:
      return 'GitHub 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.';
  }
}
