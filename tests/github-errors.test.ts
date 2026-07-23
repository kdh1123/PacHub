import { describe, expect, it } from 'vitest';

import { toGitHubUserMessage } from '../src/github/errors.js';

describe('GitHub error messages', () => {
  it('does not reveal repository existence for not-found or forbidden responses', () => {
    expect(toGitHubUserMessage({ status: 404 })).toContain('찾을 수 없거나 접근 권한');
    expect(toGitHubUserMessage({ status: 403 })).toContain('찾을 수 없거나 접근 권한');
  });

  it('maps authentication, rate-limit, and network failures to actionable messages', () => {
    expect(toGitHubUserMessage({ status: 401 })).toContain('인증');
    expect(toGitHubUserMessage({ status: 429 })).toContain('한도');
    expect(toGitHubUserMessage({ code: 'ETIMEDOUT' })).toContain('통신');
  });
});
