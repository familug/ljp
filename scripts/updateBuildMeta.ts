#!/usr/bin/env bun
/**
 * Update src/buildMeta.ts with the last commit hash and datetime in UTC.
 * Run before commit or deploy: bun scripts/updateBuildMeta.ts
 */
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outPath = join(root, 'src', 'buildMeta.ts');

let hash = 'dev';
let datetimeIso = '';

try {
  hash = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  const ts = execSync('git log -1 --format=%ct', { encoding: 'utf8' }).trim();
  if (ts) {
    const d = new Date(parseInt(ts, 10) * 1000);
    datetimeIso = d.toISOString();
  }
} catch {
  // not a git repo or no commits
}

const content = `export const BUILD_META = {
  hash: '${hash}',
  datetimeIso: '${datetimeIso}'
};

/** Format build label with datetime in user's local timezone */
export function formatBuildLabel(hash: string | undefined, datetimeIso: string | undefined): string {
  const h = hash || 'dev';
  if (!datetimeIso) return \`Build \${h}\`;
  try {
    const d = new Date(datetimeIso);
    if (isNaN(d.getTime())) return \`Build \${h} · \${datetimeIso}\`;
    const local = d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
    return \`Build \${h} · \${local}\`;
  } catch {
    return \`Build \${h} · \${datetimeIso}\`;
  }
}
`;

writeFileSync(outPath, content);
console.log(`Updated ${outPath}: hash=${hash} datetime=${datetimeIso || '(none)'}`);
