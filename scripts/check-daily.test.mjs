import { execFileSync, spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  changedFiles,
  computeGitSnapshot,
  executeChecks,
  planChecks,
} from './check-daily.mjs';

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

describe('targeted test recommendations for core chains', () => {
  it('recommends auth and token test suites when auth files change', () => {
    const plan = planChecks(['apps/backend/middleware/3.auth.ts']);
    expect(
      plan.commands.some(
        (cmd) =>
          cmd.includes('3.auth.test.ts') &&
          cmd.includes('auth.service.test.ts'),
      ),
    ).toBeTruthy();
    expect(plan.notes.join('\n')).toMatch(/涉及认证或数据权限变更/u);
  });

  it('recommends data scope and rbac suites when data-scope files change', () => {
    const plan = planChecks([
      'apps/backend/modules/data-scope/data-scope.service.ts',
    ]);
    expect(
      plan.commands.some(
        (cmd) =>
          cmd.includes('data-scope.service.test.ts') &&
          cmd.includes('scoped-repository.test.ts') &&
          cmd.includes('rbac-authorize.service.test.ts'),
      ),
    ).toBeTruthy();
    expect(plan.notes.join('\n')).toMatch(/涉及认证或数据权限变更/u);
  });

  it('adds guidance note when inspection-record or non-conformance changes', () => {
    const plan = planChecks([
      'apps/backend/modules/inspection/inspection-request-close.service.ts',
    ]);
    expect(plan.notes.join('\n')).toMatch(/核心报检-检验-NC链路建议关注/u);
  });
});

describe('executeChecks and snapshot cache', () => {
  it('invalidates on untracked addition, content change and deletion in real Git', () => {
    const { root, git, write } = fixture();
    try {
      write('README.md');
      git('add', '.');
      git('commit', '--quiet', '-m', 'fixture');
      const clean = computeGitSnapshot(root);
      write('new-code.js', 'valid');
      const added = computeGitSnapshot(root);
      expect(added).not.toBe(clean);
      const commands = [
        `node -e "const fs=require('node:fs'); process.exit(fs.readFileSync('new-code.js','utf8')==='valid'?0:9)"`,
      ];
      const options = { root, reuseContext: {} };
      expect(executeChecks(commands, options).results[0].status).toBe('PASS');
      expect(executeChecks(commands, options).results[0].status).toBe('SKIP');
      write('new-code.js', 'broken');
      expect(computeGitSnapshot(root)).not.toBe(added);
      const failed = executeChecks(commands, options);
      expect(failed.allPassed).toBe(false);
      expect(failed.results[0]).toMatchObject({ status: 'FAIL', exitCode: 9 });
      expect(
        executeChecks(commands, { ...options, useCache: false }).results[0]
          .exitCode,
      ).toBe(9);
      rmSync(path.join(root, 'new-code.js'));
      expect(computeGitSnapshot(root)).toBe(clean);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('isolates linked checkouts even at identical commits and contents', () => {
    const { root, git, write } = fixture();
    const other = path.join(root, '..', `${path.basename(root)}-linked`);
    try {
      write('README.md');
      git('add', '.');
      git('commit', '--quiet', '-m', 'fixture');
      git('worktree', 'add', '--detach', other, 'HEAD');
      expect(computeGitSnapshot(root)).not.toBe(computeGitSnapshot(other));
      const reuseContext = {};
      const commands = ['node -e "process.exit(0)"'];
      expect(
        executeChecks(commands, { root, reuseContext }).results[0].status,
      ).toBe('PASS');
      expect(
        executeChecks(commands, { root: other, reuseContext }).results[0]
          .status,
      ).toBe('PASS');
    } finally {
      rmSync(other, { recursive: true, force: true });
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('disables reuse for secret, unknown and symlink paths without content fingerprints', () => {
    const { root, git, write } = fixture();
    try {
      write('README.md');
      git('add', '.');
      git('commit', '--quiet', '-m', 'fixture');
      const options = { root, reuseContext: {} };
      for (const file of ['.env', 'private-key.js', 'settings.json']) {
        write(file, 'synthetic fixture only');
        expect(computeGitSnapshot(root)).toBeNull();
        const commands = ['node -e "process.exit(0)"'];
        expect(executeChecks(commands, options).results[0].status).toBe('PASS');
        expect(executeChecks(commands, options).results[0].status).toBe('PASS');
        rmSync(path.join(root, file));
      }
      symlinkSync('/nonexistent/secret', path.join(root, 'source.js'));
      expect(computeGitSnapshot(root)).toBeNull();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects PASS when a command changes the workspace and runs no later checks', () => {
    const { root, git, write } = fixture();
    try {
      write('README.md');
      git('add', '.');
      git('commit', '--quiet', '-m', 'fixture');
      const result = executeChecks(
        [
          'node -e "process.exit(0)"',
          `node -e "require('node:fs').writeFileSync('new-code.js','changed')"`,
          'node -e "process.exit(0)"',
        ],
        { root, reuseContext: {} },
      );
      expect(result.allPassed).toBe(false);
      expect(result.results).toHaveLength(2);
      expect(result.results.every((item) => item.status === 'FAIL')).toBe(true);
      expect(result.results[1].stderr).toContain('工作树');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('requires an explicit stable runtime context and invalidates when it is replaced', () => {
    const { root, git, write } = fixture();
    try {
      write('README.md');
      git('add', '.');
      git('commit', '--quiet', '-m', 'fixture');
      const commands = ['node -e "process.exit(0)"'];
      expect(executeChecks(commands, { root }).results[0].status).toBe('PASS');
      expect(executeChecks(commands, { root }).results[0].status).toBe('PASS');
      const options = { root, reuseContext: {} };
      expect(executeChecks(commands, options).results[0].status).toBe('PASS');
      expect(executeChecks(commands, options).results[0].status).toBe('SKIP');
      expect(
        executeChecks(commands, { root, reuseContext: {} }).results[0].status,
      ).toBe('PASS');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('executes planned commands and records results', () => {
    const { root, git, write } = fixture();
    write('README.md');
    git('add', '.');
    git('commit', '--quiet', '-m', 'fixture');
    const reuseContext = {};
    try {
      const commands = [
        'node -e "process.exit(0)"',
        'node -e "process.exit(0)"',
      ];

      const res = executeChecks(commands, {
        root,
        reuseContext,
        useCache: true,
      });
      expect(res.allPassed).toBe(true);
      expect(res.results.length).toBe(2);
      expect(res.results[0].status).toBe('PASS');
      expect(res.results[0].cached).toBe(false);

      // Second run with same snapshot reuses cache
      const res2 = executeChecks(commands, {
        root,
        reuseContext,
        useCache: true,
      });
      expect(res2.allPassed).toBe(true);
      expect(res2.results[0].status).toBe('SKIP');
      expect(res2.results[0].cached).toBe(true);
      expect(res2.results[1].status).toBe('SKIP');

      // noCache bypasses cache
      const res3 = executeChecks(commands, {
        root,
        reuseContext,
        useCache: false,
      });
      expect(res3.allPassed).toBe(true);
      expect(res3.results[0].status).toBe('PASS');
      expect(res3.results[0].cached).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('stops and reports on command failure without swallowing errors', () => {
    const tempCacheDir = mkdtempSync(path.join(tmpdir(), 'qgs-cache-fail-'));
    try {
      const commands = [
        'node -e "process.exit(0)"',
        'node -e "console.error(\'failed_msg\'); process.exit(42)"',
        'node -e "process.exit(0)"',
      ];
      const res = executeChecks(commands, {
        cacheDir: tempCacheDir,
        snapshot: 'fail-snap',
        useCache: true,
      });
      expect(res.allPassed).toBe(false);
      expect(res.results.length).toBe(2);
      expect(res.results[0].status).toBe('PASS');
      expect(res.results[1].status).toBe('FAIL');
      expect(res.results[1].exitCode).toBe(42);
      expect(res.results[1].stderr).toContain('failed_msg');
    } finally {
      rmSync(tempCacheDir, { recursive: true, force: true });
    }
  });

  it('changes snapshot when git worktree modifies', () => {
    const { root, git, write } = fixture();
    try {
      write('README.md', 'v1');
      git('add', '.');
      git('commit', '-m', 'c1');
      const snap1 = computeGitSnapshot(root);
      write('README.md', 'v2');
      const snap2 = computeGitSnapshot(root);
      expect(snap1).not.toBe(snap2);
      git('add', '.');
      const snap3 = computeGitSnapshot(root);
      expect(snap3).not.toBe(snap1);
      expect(snap3).not.toBe(snap2);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('cli --run flag executes commands and outputs summary', () => {
    const { root, git, write } = fixture();
    try {
      write('README.md', 'docs change');
      write(
        'package.json',
        JSON.stringify({
          name: 'fixture',
          scripts: { 'check:docs-drift': 'node -e "process.exit(0)"' },
        }),
      );
      git('add', '.');
      git('commit', '-m', 'docs');
      write('docs/new.md', 'new content');
      // Execute check:daily with --run --base HEAD
      const res = spawnSync(
        process.execPath,
        [script, '--base', 'HEAD', '--run'],
        {
          cwd: root,
          encoding: 'utf8',
        },
      );
      expect(res.status).toBe(0);
      expect(res.stdout).toContain('开始按计划执行检查');
      expect(res.stdout).toContain('快照:');
      expect(res.stdout).toContain('全部检查通过');
      expect(res.stdout).toContain('汇总：PASS=1 FAIL=0 SKIP=0 未执行=0');
      expect(res.stdout).toContain('复用已禁用');
      const again = spawnSync(
        process.execPath,
        [script, '--base', 'HEAD', '--run'],
        { cwd: root, encoding: 'utf8' },
      );
      expect(again.status).toBe(0);
      expect(again.stdout).toContain('汇总：PASS=1 FAIL=0 SKIP=0');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
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
