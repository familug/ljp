#!/usr/bin/env node
import { copyFileSync, existsSync, chmodSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const src = join(root, 'hooks', 'pre-commit');
const dest = join(root, '.git', 'hooks', 'pre-commit');
const destDir = join(root, '.git', 'hooks');

if (existsSync(src) && existsSync(destDir)) {
  copyFileSync(src, dest);
  chmodSync(dest, 0o755);
}
