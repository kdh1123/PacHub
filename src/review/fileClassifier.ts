const lockFiles = new Set([
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'bun.lockb',
  'poetry.lock',
  'Pipfile.lock',
  'Gemfile.lock',
  'Cargo.lock',
  'composer.lock',
]);
const assetExtension = /\.(png|jpe?g|gif|webp|svg|ico|pdf|zip|tar|gz|mp3|mp4|mov|woff2?|ttf|otf)$/i;

export function getExclusionReason(filename: string): string | undefined {
  const lower = filename.toLowerCase();
  if (lockFiles.has(filename)) return '의존성 잠금 파일';
  if (assetExtension.test(filename)) return '바이너리 또는 미디어 파일';
  if (
    /^(dist|build|out|coverage|\.next|target|generated|vendor|node_modules|public\/build)\//.test(
      lower,
    )
  )
    return '빌드 또는 생성 파일';
  if (/\.(min\.(js|css)|map|snap)$/i.test(filename)) return '축소 또는 생성 가능성이 높은 파일';
  return undefined;
}

export function classifyFile(filename: string): string[] {
  const lower = filename.toLowerCase();
  const categories = new Set<string>();
  if (getExclusionReason(filename))
    categories.add(assetExtension.test(filename) ? 'Asset' : 'Generated');
  if (/(^|\/)(test|tests|__tests__|spec)\//.test(lower) || /\.(test|spec)\.[^/]+$/.test(lower))
    categories.add('Test');
  if (/^\.github\/workflows\//.test(lower) || /jenkinsfile|\.gitlab-ci|circleci/.test(lower))
    categories.add('CI/CD');
  if (/dockerfile|docker-compose|terraform|kubernetes|helm|nginx|deployment/.test(lower))
    categories.add('Infrastructure');
  if (/migrations?|prisma|schema\.sql|\.sql$/.test(lower)) categories.add('Migration');
  if (
    /package\.json|requirements\.txt|pyproject\.toml|pom\.xml|build\.gradle|go\.mod|cargo\.toml|composer\.json/.test(
      lower,
    )
  )
    categories.add('Dependency');
  if (/readme|\.md$|docs\//.test(lower)) categories.add('Documentation');
  if (/\.env|config|tsconfig|eslint|prettier|vite\.config|webpack\.config/.test(lower))
    categories.add('Configuration');
  if (
    /^(src|app|lib|packages|server|client)\//.test(lower) ||
    /\.(ts|tsx|js|jsx|java|py|go|rs)$/.test(lower)
  )
    categories.add('Source Code');
  if (categories.size === 0) categories.add('Unknown');
  return [...categories];
}

export function isTestFile(filename: string): boolean {
  return classifyFile(filename).includes('Test');
}
