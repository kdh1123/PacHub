import { parseAddedLines } from './diffParser.js';
import type { ChangedFile, ReviewFinding } from './types.js';

function finding(
  file: string,
  line: number | undefined,
  id: string,
  severity: ReviewFinding['severity'],
  category: string,
  title: string,
  description: string,
  recommendation: string,
  confidence: ReviewFinding['confidence'],
  evidence?: string,
): ReviewFinding {
  return {
    id,
    severity,
    category,
    file,
    line,
    title,
    description,
    recommendation,
    confidence,
    evidence,
  };
}

function maskedEvidence(value: string): string {
  return value.length > 12 ? `${value.slice(0, 4)}…[masked]` : '[masked]';
}

export function analyzeFileRules(file: ChangedFile): ReviewFinding[] {
  const findings: ReviewFinding[] = [];
  const lines = parseAddedLines(file.patch);
  const isWorkflow = file.filename.startsWith('.github/workflows/');

  for (const { line, content } of lines) {
    if (/-----begin (rsa |ec |openssh )?private key-----/i.test(content))
      findings.push(
        finding(
          file.filename,
          line,
          'private-key',
          'CRITICAL',
          'Secret',
          '개인 키 노출 가능성',
          'PEM 개인 키 헤더가 추가되었습니다.',
          '키를 즉시 폐기하고 비밀 저장소로 이동하세요.',
          'HIGH',
          '[private key masked]',
        ),
      );
    else if (
      /github_pat_|gh[pousr]_[a-z0-9_]{20,}|(?:api[_-]?key|secret|password|token)\s*[:=]\s*['"][^'" ]{12,}/i.test(
        content,
      ) &&
      !/example|placeholder|your[_-]?/i.test(content)
    )
      findings.push(
        finding(
          file.filename,
          line,
          'secret-pattern',
          'HIGH',
          'Secret',
          '비밀정보 노출 가능성',
          '토큰 또는 자격 증명 형태의 값이 추가된 것으로 보입니다. 확인이 필요합니다.',
          '실제 값이라면 폐기하고 환경 변수 또는 비밀 저장소로 이동하세요.',
          'MEDIUM',
          maskedEvidence(content),
        ),
      );
    if (
      /\beval\s*\(|new Function\s*\(|child_process|execSync?\s*\(|spawn\s*\(|shell\s*:\s*true|dangerouslySetInnerHTML|document\.write\s*\(/.test(
        content,
      )
    )
      findings.push(
        finding(
          file.filename,
          line,
          'dangerous-code',
          'HIGH',
          'Dangerous Code',
          '위험한 실행 또는 DOM 패턴',
          '동적 코드 실행·쉘 실행·안전하지 않은 DOM 삽입 패턴이 추가되었습니다. 맥락 검토가 필요합니다.',
          '신뢰할 수 없는 입력이 전달되지 않는지 확인하고 안전한 API를 사용하세요.',
          'MEDIUM',
          content.slice(0, 120),
        ),
      );
    if (
      /\b(drop table|drop column|truncate)\b/i.test(content) ||
      (/\bdelete\s+from\b/i.test(content) && !/\bwhere\b/i.test(content))
    )
      findings.push(
        finding(
          file.filename,
          line,
          'destructive-migration',
          'HIGH',
          'Database',
          '되돌리기 어려운 데이터 변경 가능성',
          '파괴적 SQL 구문 또는 WHERE 없는 DELETE로 보이는 변경입니다.',
          '백업·롤백·데이터 영향과 실제 조건을 검토하세요.',
          'MEDIUM',
          content.slice(0, 120),
        ),
      );
    if (
      isWorkflow &&
      /pull_request_target|permissions:\s*write-all|contents:\s*write|actions:\s*write|id-token:\s*write/i.test(
        content,
      )
    )
      findings.push(
        finding(
          file.filename,
          line,
          'workflow-security',
          'HIGH',
          'CI/CD Security',
          'GitHub Actions 권한 상승 가능성',
          '워크플로에서 높은 권한 또는 pull_request_target 패턴이 추가되었습니다.',
          '최소 권한 원칙과 외부 PR 코드 실행 여부를 검토하세요.',
          'HIGH',
          content.slice(0, 120),
        ),
      );
    if (
      /!important|dangerouslySetInnerHTML|position:\s*absolute|overflow:\s*hidden|z-index:\s*\d{4,}/i.test(
        content,
      )
    )
      findings.push(
        finding(
          file.filename,
          line,
          'ui-regression',
          'MEDIUM',
          'Frontend',
          'UI 회귀 가능성',
          '전역 스타일 또는 레이아웃에 영향을 줄 수 있는 패턴이 추가되었습니다.',
          'Windows·macOS와 여러 화면 크기에서 시각 회귀를 확인하세요.',
          'LOW',
          content.slice(0, 120),
        ),
      );
    if (/\b(it|test|describe)\.(skip|only)\b|@skip|\.only\s*\(/.test(content))
      findings.push(
        finding(
          file.filename,
          line,
          'test-disabled',
          'MEDIUM',
          'Test',
          '테스트 비활성화 또는 단독 실행',
          'skip 또는 only 패턴이 추가되었습니다.',
          '의도적인 임시 조치인지 확인하고 제거하세요.',
          'HIGH',
          content.slice(0, 120),
        ),
      );
  }
  return findings;
}
