import { execFileSync, spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { expect, it } from 'vitest';

import { changedFiles, planChecks } from './check-daily.mjs';

const script = path.resolve('scripts/check-daily.mjs');

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'qgs-daily-'));
  const git = (...args) =>
    execFileSync('git', args, { cwd: root, encoding: 'utf8' });
  git('init', '--quiet');
  git('config', 'user.email', 'fixture@example.invalid');
  git('config', 'user.name', 'Fixture');
  const write = (file, contents = 'fixture') => {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), contents);
  };
  return { root, git, write };
}

it('prose only recommends docs drift without unrelated code gates', () => {
  const plan = planChecks(['docs/testing.md', 'PROJECT_STATE.md']);
  expect(plan.kinds).toEqual(['文档']);
  expect(plan.commands).toEqual(['pnpm run check:docs-drift']);
  expect(plan.notes.join('\n')).toMatch(/Markdown.*完整提交门禁/u);
  expect(plan.notes.join('\n')).toContain('本命令未执行 docs-drift');
  expect(plan.notes.join('\n')).toContain('pnpm run docs:sync');
  expect(plan.notes.join('\n')).toContain('rtk git diff -- PROJECT_STATE.md');
  expect(plan.commands).not.toContain('pnpm run docs:sync');
});

it('only advises on real stale documents and never executes checks or sync', () => {
  const { root, git, write } = fixture();
  try {
    write('README.md');
    git('add', '.');
    git('commit', '--quiet', '-m', 'fixture');
    write('PROJECT_STATE.md', '- 版本: stale\n人工说明：保留审批结论。\n');
    write(
      'scripts/check-docs-drift.sh',
      "echo 'UNEXPECTED_CHECK_EXECUTION'; exit 1",
    );
    write(
      'scripts/sync-project-state.sh',
      "echo 'UNEXPECTED_SYNC_EXECUTION'; exit 1",
    );
    const stateBefore = readFileSync(
      path.join(root, 'PROJECT_STATE.md'),
      'utf8',
    );
    const result = spawnSync(process.execPath, [script, '--base', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('本命令未执行 docs-drift');
    expect(result.stdout).toContain('若 check:docs-drift 报 D1 数字漂移');
    expect(result.stdout).toContain('pnpm run docs:sync');
    expect(result.stdout).not.toContain('UNEXPECTED_CHECK_EXECUTION');
    expect(result.stdout).not.toContain('UNEXPECTED_SYNC_EXECUTION');
    expect(result.stdout).not.toContain('docs drift check PASSED');
    expect(readFileSync(path.join(root, 'PROJECT_STATE.md'), 'utf8')).toBe(
      stateBefore,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it('backend selects local typecheck, lint and sibling tests', () => {
  const { root, write } = fixture();
  try {
    const source = 'apps/backend/modules/inspection/example.service.ts';
    write(source);
    write(source.replace('.ts', '.test.ts'));
    const plan = planChecks([source], root);
    expect(
      plan.commands.includes('pnpm --dir apps/backend exec tsc --noEmit'),
    ).toBeTruthy();
    expect(
      plan.commands.some((command) => command.startsWith('pnpm exec eslint')),
    ).toBeTruthy();
    expect(
      plan.commands.some((command) => command.includes('rtk vitest run')),
    ).toBeTruthy();
    expect(!plan.commands.includes('pnpm run check:type')).toBeTruthy();
    expect(!plan.commands.includes('pnpm lint')).toBeTruthy();
    expect(plan.notes.join('\n')).toMatch(/相邻测试只是定位起点/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it('frontend styles retain format and style checks with runtime advice', () => {
  const { root, write } = fixture();
  try {
    const source = "apps/web-antd/src/views/qms/a'b.scss";
    write(source);
    const plan = planChecks([source], root);
    expect(
      plan.commands.includes('pnpm --filter @qgs/web-antd run typecheck'),
    ).toBeTruthy();
    expect(
      plan.commands.some((command) =>
        command.startsWith('pnpm exec stylelint'),
      ),
    ).toBeTruthy();
    expect(
      plan.commands.some((command) => command.startsWith('pnpm exec prettier')),
    ).toBeTruthy();
    expect(
      plan.commands.some((command) => command.includes(String.raw`'\''`)),
    ).toBeTruthy();
    expect(plan.notes.join('\n')).toMatch(/静态检查通过不等于运行验收/u);
    expect(
      planChecks(['apps/weapp/src/pages/home.vue']).notes.join('\n'),
    ).toMatch(/typecheck.*跳过/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it('shared, configuration, migration and uncertain changes stay conservative', () => {
  for (const files of [
    ['packages/qgs-shared/src/index.ts'],
    ['docs/testing.md', 'apps/backend/package.json'],
    ['apps/web-antd/vite.config.mts'],
    ['.gitignore'],
  ]) {
    const plan = planChecks(files);
    for (const command of [
      'pnpm lint',
      'pnpm run check:type',
      'pnpm run check:qms-arch',
      'pnpm run check:docs-drift',
    ]) {
      expect(plan.commands.includes(command)).toBeTruthy();
    }
  }
  expect(
    planChecks([], process.cwd(), true).commands.includes('pnpm lint'),
  ).toBeTruthy();
  expect(
    planChecks(['apps/backend/prisma/schema.prisma']).commands.includes(
      'pnpm run check:prisma-migration',
    ),
  ).toBeTruthy();
  expect(
    planChecks(['docs/metrics-registry.md']).commands.includes(
      'pnpm run check:metric-governance',
    ),
  ).toBeTruthy();
});

it('real Git includes commits, staged, unstaged, untracked and renamed/deleted code', () => {
  const { root, git, write } = fixture();
  try {
    write('apps/backend/old.ts');
    write('apps/backend/delete.ts');
    write('README.md');
    git('add', '.');
    git('commit', '--quiet', '-m', 'fixture');
    git('branch', 'base');
    write('apps/web-antd/committed.ts');
    git('add', '.');
    git('commit', '--quiet', '-m', 'committed');
    mkdirSync(path.join(root, 'docs'), { recursive: true });
    git('mv', 'apps/backend/old.ts', 'docs/renamed.md');
    git('rm', 'apps/backend/delete.ts');
    write('README.md', 'changed');
    write('docs/untracked.md');
    const result = changedFiles(root, 'base');
    expect(result.files).toEqual([
      'README.md',
      'apps/backend/delete.ts',
      'apps/backend/old.ts',
      'apps/web-antd/committed.ts',
      'docs/renamed.md',
      'docs/untracked.md',
    ]);
    const plan = planChecks(result.files, root);
    expect(
      plan.commands.includes('pnpm --dir apps/backend exec tsc --noEmit'),
    ).toBeTruthy();
    expect(
      plan.commands.includes('pnpm --filter @qgs/web-antd run typecheck'),
    ).toBeTruthy();
    const statusBefore = git('status', '--porcelain');
    const cli = spawnSync(process.execPath, [script, '--base', 'base'], {
      cwd: root,
      encoding: 'utf8',
    });
    expect(cli.status).toBe(0);
    expect(cli.stdout).toMatch(/6 个文件/u);
    expect(git('status', '--porcelain')).toBe(statusBefore);
    const invalid = spawnSync(process.execPath, [script, '--base', 'missing'], {
      cwd: root,
      encoding: 'utf8',
    });
    expect(invalid.status).toBe(2);
    expect(invalid.stderr).toMatch(/无法生成检查建议/u);
    expect(!invalid.stdout.includes('通过')).toBeTruthy();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
