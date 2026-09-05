import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { isDocsOnlyPush } from './run-pre-push.mjs';

const exec = promisify(execFile);
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const hook = join(root, 'node_modules/.bin/lefthook');

/** Test real Git diffs and Lefthook stdin forwarding without pushing or running project checks. */
async function fixture(t) {
  const cwd = mkdtempSync(join(tmpdir(), 'qg-prepush-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = async (...args) => {
    const result = await exec(
      'git',
      ['-c', 'core.hooksPath=/dev/null', ...args],
      { cwd },
    );
    return result.stdout.trim();
  };
  await git('init', '--initial-branch=main');
  await git('config', 'user.name', 'Hook test');
  await git('config', 'user.email', 'hook-test@example.invalid');
  await git('config', 'commit.gpgsign', 'false');
  mkdirSync(join(cwd, 'scripts'));
  mkdirSync(join(cwd, 'bin'));
  copyFileSync(join(root, 'lefthook.yml'), join(cwd, 'lefthook.yml'));
  copyFileSync(
    join(root, 'scripts/run-pre-push.mjs'),
    join(cwd, 'scripts/run-pre-push.mjs'),
  );
  writeFileSync(join(cwd, 'README.md'), '# Original\n');
  writeFileSync(join(cwd, 'source.ts'), 'export const value = 1;\n');
  writeFileSync(
    join(cwd, 'bin/pnpm'),
    `#!/usr/bin/env node
const fs = require('node:fs');
const name = process.argv[3];
fs.appendFileSync('.git/checks.log', name + '\\n');
process.exit(name === process.env.QG_TEST_FAIL_CHECK ? 1 : 0);
`,
  );
  chmodSync(join(cwd, 'bin/pnpm'), 0o755);
  await git('add', '.');
  await git('commit', '-m', 'test: baseline');
  const base = await git('rev-parse', 'HEAD');
  const commit = async () => {
    await git('add', '.');
    await git('commit', '-m', 'test: change');
    const head = await git('rev-parse', 'HEAD');
    return `refs/heads/main ${head} refs/heads/main ${base}\n`;
  };
  return { cwd, base, commit, git };
}

test('classification keeps code, deletions, renames, unknown files and uncertain refs on full checks', async (t) => {
  const cases = [
    [
      'prose only',
      (cwd) => writeFileSync(join(cwd, 'README.md'), '# Updated\n'),
      true,
    ],
    [
      'code plus prose',
      (cwd) => {
        writeFileSync(join(cwd, 'README.md'), '# Updated\n');
        writeFileSync(join(cwd, 'source.ts'), 'export const value = 2;\n');
      },
      false,
    ],
    ['deleted code', (cwd) => rmSync(join(cwd, 'source.ts')), false],
    [
      'code renamed to prose',
      (cwd) => renameSync(join(cwd, 'source.ts'), join(cwd, 'CHANGELOG.md')),
      false,
    ],
    [
      'unlisted markdown',
      (cwd) =>
        writeFileSync(join(cwd, 'registry.md'), '# Executable contract\n'),
      false,
    ],
  ];
  for (const [name, change, expected] of cases) {
    await t.test(name, async (subtest) => {
      const f = await fixture(subtest);
      change(f.cwd);
      const input = await f.commit();
      assert.equal(await isDocsOnlyPush(input, f.cwd), expected);
    });
  }
  await t.test(
    'every destination baseline contributes to classification',
    async (subtest) => {
      const f = await fixture(subtest);
      writeFileSync(join(f.cwd, 'source.ts'), 'export const value = 2;\n');
      await f.commit();
      const codeBase = await f.git('rev-parse', 'HEAD');
      writeFileSync(join(f.cwd, 'README.md'), '# Updated\n');
      const fullInput = await f.commit();
      const docsInput = fullInput.replace(f.base, codeBase);
      assert.equal(await isDocsOnlyPush(docsInput, f.cwd), true);
      assert.equal(
        await isDocsOnlyPush(
          docsInput +
            fullInput.replaceAll('refs/heads/main', 'refs/heads/other'),
          f.cwd,
        ),
        false,
      );
    },
  );
  await t.test(
    'missing input/history, new refs, non-HEAD pushes and local WIP',
    async (subtest) => {
      const f = await fixture(subtest);
      writeFileSync(join(f.cwd, 'README.md'), '# Updated\n');
      const input = await f.commit();
      for (const invalid of [
        '',
        'invalid\n',
        input.replace(f.base, '0'.repeat(40)),
        input.replace(f.base, 'f'.repeat(40)),
        input.replace('refs/heads/main', 'refs/tags/v1'),
      ]) {
        assert.equal(await isDocsOnlyPush(invalid, f.cwd), false);
      }
      assert.equal(await isDocsOnlyPush(`${input}invalid\n`, f.cwd), false);
      assert.equal(
        await isDocsOnlyPush(
          `refs/heads/other ${f.base} refs/heads/other ${f.base}\n`,
          f.cwd,
        ),
        false,
      );
      writeFileSync(join(f.cwd, 'source.ts'), 'export const value = 3;\n');
      assert.equal(await isDocsOnlyPush(input, f.cwd), false);
      await f.git('add', 'source.ts');
      assert.equal(await isDocsOnlyPush(input, f.cwd), false);
      await f.git('commit', '-m', 'test: local code');
      const head = await f.git('rev-parse', 'HEAD');
      const cleanInput = `refs/heads/main ${head} refs/heads/main ${head}\n`;
      writeFileSync(join(f.cwd, 'unknown.file'), 'unknown\n');
      assert.equal(await isDocsOnlyPush(cleanInput, f.cwd), false);
    },
  );
});

test('real Lefthook forwards push input and propagates check failures', async (t) => {
  for (const [name, mixed, failed, expected] of [
    ['prose', false, '', ['check:docs-drift']],
    ['mixed', true, '', ['check:type', 'check:qms-arch', 'check:docs-drift']],
    [
      'type failure',
      true,
      'check:type',
      ['check:type', 'check:qms-arch', 'check:docs-drift'],
    ],
    ['docs failure', false, 'check:docs-drift', ['check:docs-drift']],
  ]) {
    await t.test(name, async (subtest) => {
      const f = await fixture(subtest);
      writeFileSync(join(f.cwd, 'README.md'), '# Updated\n');
      if (mixed)
        writeFileSync(join(f.cwd, 'source.ts'), 'export const value = 2;\n');
      const input = await f.commit();
      const child = execFile(
        hook,
        ['run', 'pre-push', '--no-auto-install', '--no-tty'],
        {
          cwd: f.cwd,
          env: {
            ...process.env,
            PATH: `${join(f.cwd, 'bin')}:${process.env.PATH}`,
            QG_TEST_FAIL_CHECK: failed,
            LEFTHOOK: '1',
            LEFTHOOK_EXCLUDE: '',
          },
          timeout: 15_000,
        },
      );
      child.stdin.end(input);
      const status = await new Promise((done) =>
        child.on('exit', (code) => done(code)),
      );
      assert.equal(status, failed ? 1 : 0);
      assert.deepEqual(
        readFileSync(join(f.cwd, '.git/checks.log'), 'utf8')
          .trim()
          .split('\n')
          .sort(),
        [...expected].sort(),
      );
    });
  }
});
