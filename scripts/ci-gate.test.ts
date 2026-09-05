import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { expect, it } from 'vitest';

const root = process.cwd();
const workflow = readFileSync(
  path.join(root, '.github/workflows/ci-gate.yml'),
  'utf8',
);
const job =
  workflow.split('\n  qms-arch:\n')[1]?.split('\n  unit-tests:\n')[0] ?? '';
// Execute the workflow's actual shell block so the test cannot drift into a duplicate implementation.
const block = job.match(/ {8}run: \|\n((?: {10}.*\n)+)/)?.[1];
const incrementalRun = block?.replaceAll(/^ {10}/gm, '') ?? '';

it('keeps all gates blocking in the existing job and supplies the event base with full history', () => {
  expect(job).toContain('fetch-depth: 0');
  expect(job).toContain(
    'github.event.pull_request.base.sha || github.event.before',
  );
  for (const command of [
    'check:qms-arch:all',
    'check:docs-drift',
    'check:metric-governance',
  ]) {
    expect(job).toContain(`run: pnpm run ${command}\n`);
  }
  expect(job).not.toMatch(/continue-on-error:|\bif:|\|\| true/);
  expect(incrementalRun).toContain('pnpm run check:qms-arch -- --changed');
});

it('blocks unknown bases and real incremental violations while allowing a complete change', () => {
  const cwd = mkdtempSync(path.join(tmpdir(), 'qg-ci-gate-'));
  const write = (file: string, text: string) => {
    const target = path.join(cwd, file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, text);
  };
  const git = (...args: string[]) => {
    const result = spawnSync(
      'git',
      ['-c', 'core.hooksPath=/dev/null', ...args],
      { cwd, encoding: 'utf8' },
    );
    expect(result.status).toBe(0);
    return result.stdout.trim();
  };
  const run = (base: string) =>
    spawnSync(
      'bash',
      ['--noprofile', '--norc', '-e', '-o', 'pipefail', '-c', incrementalRun],
      {
        cwd,
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${path.join(cwd, 'bin')}:${process.env.PATH}`,
          BASE_REF: base,
          QMS_ARCH_ROOT_DIR: cwd,
          QMS_ARCH_BASELINE: path.join(
            cwd,
            'scripts/qms-architecture-baseline.txt',
          ),
          QG_TEST_ARCH_SCRIPT: path.join(
            root,
            'scripts/check-qms-architecture.sh',
          ),
        },
      },
    );
  try {
    git('init', '--quiet');
    git('config', 'user.name', 'CI test');
    git('config', 'user.email', 'ci-test@example.invalid');
    git('config', 'commit.gpgsign', 'false');
    write('scripts/qms-architecture-baseline.txt', '');
    write('README.md', '# Base\n');
    write('code_map.md', '# Modules\n');
    write(
      'apps/backend/prisma/schema.prisma',
      'model suppliers {\n  id String @id\n  supplierName String\n}\n',
    );
    write(
      'apps/backend/utils/master-data-fields.ts',
      "export const fields = [{ table: 'suppliers', nameColumn: 'supplierName' }];\n",
    );
    // Only replace package-manager dispatch; execute the real architecture guard.
    write(
      'bin/pnpm',
      '#!/usr/bin/env bash\n[[ "$*" == "run check:qms-arch -- --changed" ]] || exit 2\nexec bash "$QG_TEST_ARCH_SCRIPT" --changed\n',
    );
    chmodSync(path.join(cwd, 'bin/pnpm'), 0o755);
    git('add', '.');
    git('commit', '-qm', 'test: base');
    const base = git('rev-parse', 'HEAD');
    write('README.md', '# Updated\n');
    git('add', '.');
    git('commit', '-qm', 'test: docs');
    expect(run(base).status).toBe(0);
    for (const invalid of [
      '',
      '0'.repeat(40),
      'f'.repeat(40),
      'main; exit 0',
    ]) {
      expect(run(invalid).status).not.toBe(0);
    }
    write('apps/backend/modules/new-domain/index.ts', 'export {};\n');
    write(
      'apps/backend/prisma/schema.prisma',
      'model suppliers {\n  id String @id\n  supplierName String\n}\n\nmodel purchases {\n  id String @id\n  supplierName String\n}\n',
    );
    git('add', '.');
    git('commit', '-qm', 'test: unregistered module and governed field');
    // Reproduce main-push checkout: origin/main already equals HEAD, so only the explicit base catches the change.
    git('update-ref', 'refs/remotes/origin/main', 'HEAD');
    const rejected = run(base);
    expect(rejected.status).toBe(1);
    expect(rejected.stdout).toContain('[B-MAP1]');
    expect(rejected.stdout).toContain('[B-GF]');
    write('code_map.md', '# Modules\n- new-domain\n');
    write(
      'apps/backend/utils/master-data-fields.ts',
      "export const fields = [{ table: 'suppliers', nameColumn: 'supplierName' }, { table: 'purchases', nameColumn: 'supplierName' }];\n",
    );
    const accepted = run(base);
    expect(accepted.status).toBe(0);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}, 30_000);
