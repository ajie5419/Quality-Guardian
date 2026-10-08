import { execFileSync, spawn, spawnSync } from 'node:child_process';
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
  it.each([
    'docs/auth-guide.md',
    'docs/token-data-scope-inspection-request.md',
    'apps/backend/modules/inspection/non-conformance-ARCHITECTURE.md',
    'packages/qgs-shared/src/rbac-login.md',
  ])('does not infer business tests or reminders from prose: %s', (file) => {
    const plan = planChecks([file]);
    expect(plan.commands.some((cmd) => cmd.startsWith('rtk vitest'))).toBe(
      false,
    );
    expect(plan.notes.join('\n')).not.toContain('涉及认证或数据权限变更');
    expect(plan.notes.join('\n')).not.toContain('核心报检-检验-NC');
  });

  it.each([
    'packages/qgs-shared/src/domain-modules/qms/system-auth.ts',
    'packages/qgs-shared/src/login.mjs',
    'apps/web-antd/src/api/core/auth.ts',
  ])('retains auth recommendations beyond backend: %s', (file) => {
    expect(planChecks([file]).commands.join('\n')).toContain('3.auth.test.ts');
  });

  it('retains shared scope tests and frontend inspection reminders', () => {
    expect(
      planChecks([
        'packages/qgs-shared/src/domain-modules/qms/rbac-config.ts',
      ]).commands.join('\n'),
    ).toContain('rbac-authorize.service.test.ts');
    expect(
      planChecks([
        'apps/web-antd/src/api/qms/inspection-request.ts',
      ]).notes.join('\n'),
    ).toContain('核心报检-检验-NC');
  });

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

  it.each([false, true])(
    'rejects PASS when the workspace changes (streamOutput=%s)',
    (streamOutput) => {
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
          { root, reuseContext: {}, streamOutput },
        );
        expect(result.allPassed).toBe(false);
        expect(result.results).toHaveLength(2);
        expect(result.results.every((item) => item.status === 'FAIL')).toBe(
          true,
        );
        expect(result.results[1].stderr).toContain('工作树');
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
  );

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
      expect(res.stdout).toContain('[1/1] RUN | pnpm run check:docs-drift');
      expect(res.stdout).toMatch(/\[1\/1\] PASS.*\(\d+ms\)/u);
      for (const note of planChecks(['docs/new.md'], root).notes)
        expect(res.stdout).toContain(note);
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

  it('shows progress and child output before the child finishes', async () => {
    const { root, git, write } = fixture();
    let child;
    try {
      write('.gitignore', 'release\n');
      write('README.md');
      write(
        'package.json',
        JSON.stringify({
          name: 'fixture',
          scripts: { 'check:docs-drift': 'node wait.cjs' },
        }),
      );
      // An ignored release signal avoids changing the checked Git snapshot.
      write(
        'wait.cjs',
        `const fs = require('node:fs');
console.log('CHILD_WAITING');
console.error('CHILD_STDERR');
const timer = setInterval(() => {
  if (fs.existsSync('release')) { clearInterval(timer); process.exit(0); }
}, 20);
setTimeout(() => process.exit(8), 5000).unref();
`,
      );
      git('add', '.');
      git('commit', '--quiet', '-m', 'fixture');
      write('docs/new.md');
      child = spawn(process.execPath, [script, '--base', 'HEAD', '--run'], {
        cwd: root,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let output = '';
      let errors = '';
      const finished = new Promise((resolve, reject) => {
        child.on('error', reject);
        child.on('close', resolve);
      });
      child.stderr.on('data', (chunk) => {
        errors += chunk;
      });
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error('No live output')),
          4000,
        );
        child.stdout.on('data', (chunk) => {
          output += chunk;
          if (output.includes('CHILD_WAITING')) {
            clearTimeout(timeout);
            resolve();
          }
        });
        child.on('error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });
        child.on('close', () => {
          clearTimeout(timeout);
          reject(new Error('Exited before release'));
        });
      });
      expect(child.exitCode).toBeNull();
      expect(output).toContain('[1/1] RUN');
      expect(output).toContain('pnpm run docs:sync');
      expect(output).not.toContain('[1/1] PASS');
      write('release');
      expect(await finished).toBe(0);
      expect(output).toMatch(/\[1\/1\] PASS.*\(\d+ms\)/u);
      expect(errors).toContain('CHILD_STDERR');
    } finally {
      child?.kill();
      rmSync(root, { recursive: true, force: true });
    }
  }, 10_000);

  it.each([0, 42])(
    'json captures logs, notes and exit code %s without human output',
    (exitCode) => {
      const { root, git, write } = fixture();
      try {
        write('README.md');
        write(
          'package.json',
          JSON.stringify({
            name: 'fixture',
            scripts: {
              'check:docs-drift': `node -e "console.log('JSON_CHILD_LOG'); console.error('JSON_CHILD_ERROR'); process.exit(${exitCode})"`,
            },
          }),
        );
        git('add', '.');
        git('commit', '--quiet', '-m', 'fixture');
        write('docs/token-data-scope-inspection-request.md');
        const result = spawnSync(
          process.execPath,
          [script, '--base', 'HEAD', '--run', '--json'],
          {
            cwd: root,
            encoding: 'utf8',
          },
        );
        expect(result.status).toBe(exitCode);
        expect(result.stderr).toBe('');
        const report = JSON.parse(result.stdout);
        expect(report.allPassed).toBe(exitCode === 0);
        expect(report.results[0].status).toBe(exitCode === 0 ? 'PASS' : 'FAIL');
        expect(report.results[0].stdout).toContain('JSON_CHILD_LOG');
        expect(report.results[0].stderr).toContain('JSON_CHILD_ERROR');
        expect(report.notes).toEqual(
          planChecks(['docs/token-data-scope-inspection-request.md'], root)
            .notes,
        );
        expect(report.summary).toEqual({
          PASS: exitCode === 0 ? 1 : 0,
          FAIL: exitCode === 0 ? 0 : 1,
          SKIP: 0,
          notRun: 0,
        });
        const human = spawnSync(
          process.execPath,
          [script, '--base', 'HEAD', '--run'],
          { cwd: root, encoding: 'utf8' },
        );
        expect(human.status).toBe(exitCode);
        expect(human.stdout).toContain('JSON_CHILD_LOG');
        expect(human.stderr).toContain('JSON_CHILD_ERROR');
        expect(human.stdout).toContain(
          exitCode === 0 ? '[1/1] PASS' : '[1/1] FAIL',
        );
        if (exitCode) expect(human.stderr).toContain('(exit: 42)');
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
  );

  it('keeps business reminders in execution mode and stops the plan on failure', () => {
    const { root, git, write } = fixture();
    try {
      write('README.md');
      write(
        'package.json',
        JSON.stringify({
          name: 'fixture',
          scripts: {
            lint: 'node -e "process.exit(0)"',
            'check:type': 'node -e "process.exit(42)"',
            'check:qms-arch': 'node -e "console.log(\'SHOULD_NOT_RUN\')"',
            'check:docs-drift': 'node -e "console.log(\'SHOULD_NOT_RUN\')"',
          },
        }),
      );
      git('add', '.');
      git('commit', '--quiet', '-m', 'fixture');
      const source = 'packages/qgs-shared/src/inspection-request.ts';
      write(source, 'export {};');
      const result = spawnSync(
        process.execPath,
        [script, '--base', 'HEAD', '--run'],
        {
          cwd: root,
          encoding: 'utf8',
        },
      );
      expect(result.status).toBe(42);
      for (const note of planChecks([source], root).notes)
        expect(result.stdout).toContain(note);
      expect(result.stdout).toContain('核心报检-检验-NC');
      expect(result.stdout).toContain('[1/4] RUN');
      expect(result.stdout).toContain('[2/4] FAIL');
      expect(result.stdout).toContain('汇总：PASS=1 FAIL=1 SKIP=0 未执行=2');
      expect(result.stdout).not.toContain('SHOULD_NOT_RUN');
      const json = spawnSync(
        process.execPath,
        [script, '--base', 'HEAD', '--run', '--json'],
        {
          cwd: root,
          encoding: 'utf8',
        },
      );
      expect(json.status).toBe(42);
      const report = JSON.parse(json.stdout);
      expect(report.notes).toEqual(planChecks([source], root).notes);
      expect(report.summary.notRun).toBe(2);
      expect(report.results).toHaveLength(2);
      for (const args of [
        ['--json'],
        ['--json', '--help'],
        ['--json', '--unknown'],
      ]) {
        const output = spawnSync(
          process.execPath,
          [script, '--base', 'HEAD', ...args],
          {
            cwd: root,
            encoding: 'utf8',
          },
        );
        expect(output.status).toBe(args.includes('--unknown') ? 2 : 0);
        expect(() => JSON.parse(output.stdout)).not.toThrow();
      }
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
