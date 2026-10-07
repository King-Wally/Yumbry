// Runs `playwright test` on the entries in ported-specs.txt: the tests the migrated app already
// passes. Extra arguments (`--headed`, `--project=full`, ...) are passed through to Playwright.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { E2E_ROOT } from '../support/env.ts';

const listFile = path.join(E2E_ROOT, 'ported-specs.txt');
const entries = fs
  .readFileSync(listFile, 'utf8')
  .split('\n')
  .map((line) => line.replace(/#.*/, '').trim())
  .filter(Boolean);
if (entries.length === 0) throw new Error(`${listFile} lists no specs.`);

// Playwright's CLI, run by this same Node binary: the runner stays on Node even under `bun run`.
const cli = createRequire(import.meta.url).resolve('@playwright/test/cli');
const result = spawnSync(process.execPath, [cli, 'test', ...entries, ...process.argv.slice(2)], {
  cwd: E2E_ROOT,
  stdio: 'inherit',
});
process.exit(result.status ?? 1);
