import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { getPackagesSync } from '@vben/node-utils';

import { describe, expect, it } from 'vitest';

import config, { formatScopeError } from './index.mjs';

const aliases = ['project', 'style', 'lint', 'ci', 'dev', 'deploy', 'other'];
const actualScopes = [
  ...getPackagesSync().packages.map((pkg) => pkg.packageJson.name),
  ...aliases,
];
const scopeRule = config.rules['function-rules/scope-enum'][2];

function runCommitlint(message: string) {
  const result = spawnSync('pnpm', ['exec', 'commitlint'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    input: `${message}\n`,
  });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

describe('commit scope guidance', () => {
  it('keeps every actual package, original alias and empty scope valid', () => {
    for (const scope of [...actualScopes, '', undefined]) {
      expect(scopeRule({ scope })).toEqual([true]);
    }
    expect(config.rules['function-rules/scope-enum'][0]).toBe(2);
  });

  it('rejects unknown scopes and prints the entire current whitelist and examples', () => {
    for (const scope of ['tooling', '@qgs/does-not-exist', 'PROJECT']) {
      const [valid, message] = scopeRule({ scope });
      expect(valid).toBe(false);
      expect(message).toContain('合法 scope');
      expect(message).toContain('正确提交示例');
      for (const allowed of actualScopes) expect(message).toContain(allowed);
    }
  });

  it('never lists hardcoded package names when packages are removed or renamed', () => {
    const currentScopes = ['@fixture/renamed-app', 'project'];
    const message = formatScopeError('tooling', currentScopes);
    expect(message).toContain('@fixture/renamed-app');
    expect(message).not.toContain('@qgs/');
    for (const match of message.matchAll(/(?:chore|fix)\(([^)]+)\)/g)) {
      expect(currentScopes).toContain(match[1]);
    }
  });

  it('accepts valid messages through the actual CLI used by commit-msg', () => {
    for (const message of [
      'chore(project): improve developer guidance',
      `fix(${actualScopes[0]}): handle invalid input`,
      'docs: update development guide',
    ]) {
      expect(runCommitlint(message).status).toBe(0);
    }
  });

  it('keeps the existing commit-msg hook blocking invalid scopes without creating a commit', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'qgs-commit-msg-'));
    const messageFile = path.join(directory, 'commit message.txt');
    try {
      for (const [message, expectedStatus] of [
        ['chore(project): improve developer guidance', 0],
        ['chore(tooling): improve developer guidance', 1],
      ] as const) {
        writeFileSync(messageFile, `${message}\n`);
        const result = spawnSync(
          'pnpm',
          ['exec', 'lefthook', 'run', 'commit-msg', '--', messageFile],
          { cwd: process.cwd(), encoding: 'utf8' },
        );
        expect(result.status).toBe(expectedStatus);
        if (expectedStatus !== 0) {
          expect(`${result.stdout}${result.stderr}`).toContain('正确提交示例');
        }
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('keeps CLI scope, type, subject and length violations blocking', () => {
    const invalidScope = runCommitlint(
      'chore(tooling): improve developer guidance',
    );
    expect(invalidScope.status).toBe(1);
    expect(invalidScope.output).toContain('function-rules/scope-enum');
    expect(invalidScope.output).toContain('正确提交示例');
    for (const scope of actualScopes)
      expect(invalidScope.output).toContain(scope);
    for (const message of [
      'unsupported(project): handle invalid input',
      'chore(project):',
      `chore(project): ${'x'.repeat(109)}`,
    ]) {
      expect(runCommitlint(message).status).toBe(1);
    }
  });
});
