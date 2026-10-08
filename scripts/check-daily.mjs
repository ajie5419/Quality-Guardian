import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const fullChecks = [
  'pnpm lint',
  'pnpm run check:type',
  'pnpm run check:qms-arch',
  'pnpm run check:docs-drift',
];
const proseFiles = new Set([
  'AGENTS.md',
  'CHANGELOG.md',
  'CLAUDE.md',
  'code_map.md',
  'CONSTRAINTS.md',
  'docs/governance-charter.md',
  'docs/PROJECT_GUIDE.md',
  'PROGRESS.md',
  'PROJECT_STATE.md',
  'README.md',
]);
const quote = (value) => `'${value.replaceAll("'", String.raw`'\''`)}'`;

/**
 * Advice only; hooks and CI still execute their mandatory checks.
 * Unknown paths, shared contracts and tooling retain the full recommendation.
 */
export function planChecks(files, root = process.cwd(), uncertain = false) {
  const kinds = new Set();
  for (const file of files) {
    if (
      /(?:^|\/)(?:package\.json|[^/]*config\.[^/]+|[^/]+\.ya?ml|[^/]+\.prisma)$/u.test(
        file,
      )
    ) {
      kinds.add('工具/共享/配置');
    } else if (proseFiles.has(file) || /^docs\/.*\.md$/u.test(file)) {
      kinds.add('文档');
    } else if (file.startsWith('apps/backend/')) {
      kinds.add('后端');
    } else if (file.startsWith('apps/web-antd/')) {
      kinds.add('Web 前端');
    } else if (file.startsWith('apps/weapp/')) {
      kinds.add('小程序');
    } else {
      kinds.add('工具/共享/配置');
    }
  }
  const commands = new Set();
  const notes = [
    '这是日常反馈建议，不替代项目档案 §7 的提交、hook、CI 和发布门禁。',
    '请审阅 diff、格式与引用；Markdown 内含可执行配置或脚本时按代码变更运行完整提交门禁。',
    '本命令未执行 docs-drift，也未判断文档是否漂移。若 check:docs-drift 报 D1 数字漂移，请依次运行：',
    '  pnpm run docs:sync',
    '  rtk git diff -- PROJECT_STATE.md',
    '  pnpm run check:docs-drift',
    'docs:sync 只更新 PROJECT_STATE.md 的唯一硬数据块，保留人工业务说明；D2/D3 模块地图或缺失文档需按契约人工维护，不能靠数字同步修复。',
  ];
  if (uncertain || kinds.has('工具/共享/配置')) {
    fullChecks.forEach((command) => commands.add(command));
    if (uncertain)
      notes.push('没有可用的分支基准，无法确认已提交范围；建议完整检查。');
  } else if (kinds.size === 1 && kinds.has('文档')) {
    commands.add('pnpm run check:docs-drift');
  } else if (kinds.size > 0) {
    if (kinds.has('后端')) {
      commands.add('pnpm --dir apps/backend exec tsc --noEmit');
    }
    if (kinds.has('Web 前端')) {
      commands.add('pnpm --filter @qgs/web-antd run typecheck');
    }
    if (kinds.has('小程序')) {
      notes.push(
        '小程序 typecheck 当前被项目脚本跳过，不能作为验收证据；补开发者工具实测。',
      );
    }
    const formatFiles = files.filter(
      (file) =>
        /\.(?:[cm]?[jt]sx?|vue|css|scss|less)$/u.test(file) &&
        existsSync(path.join(root, file)),
    );
    const lintFiles = formatFiles.filter(
      (file) =>
        /\.(?:[cm]?[jt]sx?|vue)$/u.test(file) &&
        existsSync(path.join(root, file)),
    );
    if (lintFiles.length > 0) {
      commands.add(
        `pnpm exec eslint ${lintFiles.map((file) => quote(file)).join(' ')}`,
      );
    }
    if (formatFiles.length > 0)
      commands.add(
        `pnpm exec prettier --check ${formatFiles.map((file) => quote(file)).join(' ')}`,
      );
    const vueFiles = formatFiles.filter((file) =>
      /\.(?:vue|css|scss|less)$/u.test(file),
    );
    if (vueFiles.length > 0) {
      commands.add(
        `pnpm exec stylelint --allow-empty-input ${vueFiles.map((file) => quote(file)).join(' ')}`,
      );
    }
    commands.add('pnpm run check:qms-arch');
    commands.add('pnpm run check:docs-drift');
  }
  if (files.some((file) => file.startsWith('apps/backend/prisma/'))) {
    commands.add('pnpm run check:prisma-migration');
    notes.push('数据库变更还需按数据库契约验证迁移；本命令不会操作数据库。');
  }
  if (files.some((file) => /metric/u.test(file))) {
    commands.add('pnpm run check:metric-governance');
  }

  // Targeted test recommendations for critical business & auth paths
  const criticalTests = new Set();
  // Include shared and frontend code, but never infer business changes from prose.
  const codeFiles = files.filter((file) =>
    /\.(?:[cm]?[jt]sx?|vue)$/u.test(file),
  );
  const hasAuthChanges = codeFiles.some((file) =>
    /auth|jwt|token|login|wx-auth/u.test(file),
  );
  const hasDataScopeChanges = codeFiles.some((file) =>
    /data-scope|scoped-repository|rbac/u.test(file),
  );
  const hasInspectionChainChanges = codeFiles.some((file) =>
    /inspection-request|inspection-issue|inspection-record|non-conformance/u.test(
      file,
    ),
  );

  if (hasAuthChanges) {
    criticalTests.add('apps/backend/middleware/3.auth.test.ts');
    criticalTests.add('apps/backend/modules/user/auth.service.test.ts');
  }
  if (hasDataScopeChanges) {
    criticalTests.add(
      'apps/backend/modules/data-scope/data-scope.service.test.ts',
    );
    criticalTests.add(
      'apps/backend/modules/data-scope/scoped-repository.test.ts',
    );
    criticalTests.add(
      'apps/backend/modules/rbac/rbac-authorize.service.test.ts',
    );
  }

  const tests = new Set();
  for (const file of files) {
    if (!/^(?:apps|packages)\/.*\.(?:ts|vue)$/u.test(file)) continue;
    const candidates = /\.(?:test|spec)\.ts$/u.test(file)
      ? [file]
      : [
          file.replace(/\.(?:ts|vue)$/u, '.test.ts'),
          file.replace(/\.(?:ts|vue)$/u, '.spec.ts'),
        ];
    for (const candidate of candidates) {
      if (existsSync(path.join(root, candidate))) tests.add(candidate);
    }
  }

  // Merge existing critical tests if present on disk
  for (const crit of criticalTests) {
    if (existsSync(path.join(root, crit))) {
      tests.add(crit);
    }
  }

  // Sibling and direct tests
  if (tests.size > 0)
    commands.add(
      `rtk vitest run ${[...tests].map((file) => quote(file)).join(' ')}`,
    );
  if (files.some((file) => /scripts\/.*(?:qms|ci-gate)/u.test(file))) {
    commands.add(
      'rtk vitest run scripts/check-qms-architecture.test.ts scripts/ci-gate.test.ts',
    );
  }
  if (files.some((file) => /scripts\/check-daily/u.test(file))) {
    commands.add('rtk vitest run scripts/check-daily.test.mjs');
  }
  if (
    files.some((file) =>
      /scripts\/(?:check-docs-drift|sync-project-state)/u.test(file),
    )
  ) {
    commands.add('rtk vitest run scripts/check-docs-drift.test.ts');
  }
  if (
    files.some((file) =>
      file.startsWith('internal/lint-configs/commitlint-config/'),
    )
  ) {
    commands.add(
      'rtk vitest run internal/lint-configs/commitlint-config/index.test.ts',
    );
  }
  if (hasInspectionChainChanges) {
    notes.push(
      '核心报检-检验-NC链路建议关注：报检关单 CAS、关联不合格项及事务副作用定向测试。',
    );
  }
  if (hasAuthChanges || hasDataScopeChanges) {
    notes.push('涉及认证或数据权限变更，已自动推荐对应定向安全与权限测试。');
  }

  if (kinds.has('后端') || kinds.has('工具/共享/配置')) {
    notes.push(
      '相邻测试只是定位起点；补受影响模块、跨模块契约及认证/权限/并发的定向验证。',
    );
  }
  if (kinds.has('Web 前端') || kinds.has('小程序')) {
    notes.push(
      '在已有获授权环境补桌面/移动端或小程序运行验证；静态检查通过不等于运行验收。',
    );
  }
  return { kinds: [...kinds], commands: [...commands], notes };
}

export function changedFiles(root, base) {
  const git = (...args) =>
    execFileSync('git', args, { cwd: root, encoding: 'utf8' });
  let reference = base;
  if (!reference) {
    try {
      git('rev-parse', '--verify', 'origin/main');
      reference = 'origin/main';
    } catch {
      reference = undefined;
    }
  }
  const lists = [
    git('diff', '--name-only', '--no-renames', '-z'),
    git('diff', '--cached', '--name-only', '--no-renames', '-z'),
    git('ls-files', '--others', '--exclude-standard', '-z'),
  ];
  if (reference) {
    git('merge-base', reference, 'HEAD');
    lists.push(
      git('diff', '--name-only', '--no-renames', '-z', `${reference}...HEAD`),
    );
  }
  return {
    files: [
      ...new Set(lists.flatMap((list) => list.split('\0').filter(Boolean))),
    ].sort(),
    reference,
  };
}

/**
 * Unknown or secret paths use metadata only and disable reuse. Never read their
 * contents, including via git diff. Checkout identity prevents cross-tree hits.
 */
function readSnapshot(root) {
  const checkout = realpathSync(root);
  const git = (...args) =>
    execFileSync('git', args, { cwd: root, encoding: 'utf8' });
  const hash = createHash('sha256');
  hash.update(checkout).update('\0').update(git('rev-parse', 'HEAD'));
  const lists = [
    git('diff', '--name-only', '--no-renames', '-z'),
    git('diff', '--cached', '--name-only', '--no-renames', '-z'),
    git('ls-files', '--others', '--exclude-standard', '-z'),
  ];
  hash.update(git('diff', '--cached', '--raw', '--no-abbrev', '-z'));
  let reusable = true;
  for (const file of [
    ...new Set(lists.flatMap((list) => list.split('\0').filter(Boolean))),
  ].sort()) {
    hash.update(file).update('\0');
    const absolute = path.join(checkout, file);
    const safePath =
      /\.(?:[cm]?[jt]sx?|vue|css|scss|less|md)$/u.test(file) &&
      !/(?:^|[/._-])(?:env|secret|secrets|credential|credentials|private|password|key|token|id_rsa|id_dsa|id_ed25519)(?:$|[/._-])/iu.test(
        file,
      );
    if (!safePath) reusable = false;
    try {
      const stat = lstatSync(absolute);
      const safe =
        safePath && stat.isFile() && realpathSync(absolute) === absolute;
      hash.update(String(stat.mode)).update('\0');
      if (safe) hash.update(readFileSync(absolute));
      else {
        reusable = false;
        hash.update(
          JSON.stringify([stat.size, stat.mtimeMs, stat.ctimeMs, stat.mode]),
        );
      }
    } catch (error) {
      hash.update(error.code ?? 'unreadable');
      // Deleted paths are fingerprinted by name; unreadable paths are unsafe.
      if (error.code !== 'ENOENT') reusable = false;
    }
    hash.update('\0');
  }
  return { key: hash.digest('hex'), reusable };
}

export function computeGitSnapshot(root = process.cwd()) {
  const snapshot = readSnapshot(root);
  return snapshot.reusable ? snapshot.key : null;
}

// A caller-owned context is a promise that tools, dependencies and external
// inputs stay fixed. CLI invocations cannot prove this and never reuse results.
const processCaches = new WeakMap();

export function executeChecks(commands, options = {}) {
  const {
    root = process.cwd(),
    useCache = true,
    reuseContext,
    streamOutput = false,
    onStart,
    onResult,
  } = options;
  const initial = readSnapshot(root);
  const contextAllowed =
    reuseContext !== null && typeof reuseContext === 'object';
  const canReuse = useCache && contextAllowed && initial.reusable;
  if (canReuse && !processCaches.has(reuseContext))
    processCaches.set(reuseContext, new Map());
  const cache = canReuse ? processCaches.get(reuseContext) : new Map();
  const results = [];
  let allPassed = true;
  const unchanged = () => readSnapshot(root).key === initial.key;
  for (const [index, command] of commands.entries()) {
    if (!unchanged()) {
      results.push({
        command,
        status: 'FAIL',
        durationMs: 0,
        exitCode: 1,
        stderr: '工作树已变化，旧快照结果无效；请重新生成计划并执行。',
      });
      allPassed = false;
      onResult?.(results.at(-1), index);
      break;
    }
    const cacheKey = JSON.stringify([initial.key, command]);
    if (canReuse && cache.has(cacheKey)) {
      results.push({
        command,
        status: 'SKIP',
        cached: true,
        durationMs: 0,
        exitCode: 0,
      });
      onResult?.(results.at(-1), index);
      continue;
    }
    onStart?.(command, index);
    const start = Date.now();
    const res = spawnSync(command, {
      cwd: root,
      shell: true,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
      // Human CLI output is inherited live; API/JSON callers retain captured logs.
      stdio: streamOutput ? ['ignore', 'inherit', 'inherit'] : 'pipe',
    });
    const durationMs = Date.now() - start;
    const stable = unchanged();
    const passed = res.status === 0 && !res.error && stable;
    results.push({
      command,
      status: passed ? 'PASS' : 'FAIL',
      cached: false,
      durationMs,
      exitCode: passed ? 0 : res.status || 1,
      stdout: res.stdout,
      stderr: stable
        ? res.stderr || res.error?.message
        : `${res.stderr ?? ''}\n工作树在执行中变化，检查结果不能作为当前快照 PASS；请重新执行。`,
    });
    onResult?.(results.at(-1), index);
    if (!passed) {
      allPassed = false;
      cache.clear();
      break;
    }
    if (canReuse) cache.set(cacheKey, true);
  }
  if (!unchanged()) {
    cache.clear();
    allPassed = false;
    for (const result of results) {
      if (result.status !== 'FAIL') {
        result.status = 'FAIL';
        result.exitCode = 1;
        result.stderr = '执行期间工作树变化，旧快照结果已失效。';
      }
    }
  }
  return {
    allPassed,
    results,
    snapshot: initial.reusable ? initial.key : null,
    cacheReason: canReuse
      ? '同进程、同稳定上下文复用'
      : '复用已禁用：未声明稳定运行上下文或存在不能安全指纹的路径',
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const json = process.argv.slice(2).includes('--json');
  try {
    const args = process.argv.slice(2).filter((arg) => arg !== '--');
    if (args.includes('--help') || args.includes('-h')) {
      const help =
        'Usage: pnpm run check:daily [--base <ref>] [--run | --exec] [--no-cache] [--json]\n' +
        '  默认只打印建议，不执行检查。范围含分支差异、暂存、未暂存和未跟踪文件。\n' +
        '  --run / --exec: 按推荐顺序执行命令，CLI 不跨进程复用，依赖/工具/环境稳定性不可证明。\n' +
        '  --no-cache:     强制重新执行全部检查，不使用同快照缓存。\n' +
        '  --json:         输出单个 JSON 对象，子进程日志收集在结果内。\n';
      process.stdout.write(json ? `${JSON.stringify({ help })}\n` : help);
      process.exit(0);
    }

    let baseRef;
    let shouldRun = false;
    let noCache = false;

    for (let i = 0; i < args.length; i++) {
      switch (args[i]) {
        case '--base': {
          baseRef = args[++i];
          if (!baseRef) throw new Error('缺少 --base 对应引用');
          break;
        }
        case '--exec':
        case '--run': {
          shouldRun = true;
          break;
        }
        case '--json': {
          break;
        }
        case '--no-cache': {
          noCache = true;
          break;
        }
        default: {
          throw new Error(`未知参数: ${args[i]}`);
        }
      }
    }

    const root = process.cwd();
    const { files, reference } = changedFiles(root, baseRef);
    const plan = planChecks(files, root, !reference);

    if (!json)
      process.stdout.write(
        `基准：${reference ?? '未知（仅工作区可见）'}\n改动：${files.length} 个文件；类型：${plan.kinds.join('、') || '无'}\n\n`,
      );

    if (shouldRun) {
      if (!json)
        process.stdout.write(
          `开始按计划执行检查...\n\n${plan.notes.join('\n')}\n\n`,
        );
      const runResult = executeChecks(plan.commands, {
        root,
        useCache: !noCache,
        streamOutput: !json,
        onStart: json
          ? undefined
          : (command, index) =>
              process.stdout.write(
                `[${index + 1}/${plan.commands.length}] RUN | ${command}\n`,
              ),
        onResult: json
          ? undefined
          : (result, index) =>
              process.stdout.write(
                `[${index + 1}/${plan.commands.length}] ${result.status} | ${result.command} (${result.durationMs}ms)\n`,
              ),
      });
      const failedItem = runResult.results.find((r) => r.status === 'FAIL');
      process.exitCode = runResult.allPassed ? 0 : failedItem?.exitCode || 1;
      if (json) {
        process.stdout.write(
          `${JSON.stringify({
            reference,
            files,
            ...plan,
            ...runResult,
            summary: {
              PASS: runResult.results.filter((r) => r.status === 'PASS').length,
              FAIL: runResult.results.filter((r) => r.status === 'FAIL').length,
              SKIP: runResult.results.filter((r) => r.status === 'SKIP').length,
              notRun: plan.commands.length - runResult.results.length,
            },
          })}\n`,
        );
      } else {
        process.stdout.write(
          '--------------------------------------------------\n',
        );
        process.stdout.write(
          `快照: ${runResult.snapshot?.slice(0, 8) ?? '不完整（禁止复用）'}；${runResult.cacheReason}\n`,
        );
        process.stdout.write(
          '--------------------------------------------------\n',
        );

        for (const res of runResult.results) {
          let mark = '✗ FAIL';
          if (res.status === 'PASS') {
            mark = '✓ PASS';
          } else if (res.status === 'SKIP') {
            mark = '⚡ SKIP (缓存)';
          }
          const time = res.durationMs > 0 ? ` (${res.durationMs}ms)` : '';
          process.stdout.write(`${mark.padEnd(16)} | ${res.command}${time}\n`);
        }

        process.stdout.write(
          '--------------------------------------------------\n',
        );
        const counts = ['PASS', 'FAIL', 'SKIP'].map(
          (status) =>
            `${status}=${runResult.results.filter((result) => result.status === status).length}`,
        );
        process.stdout.write(
          `汇总：${counts.join(' ')} 未执行=${plan.commands.length - runResult.results.length}\n`,
        );
        if (runResult.allPassed) {
          process.stdout.write('🎉 全部检查通过 (日常辅助通过，非门禁替代)\n');
        } else {
          process.stderr.write(
            `\n❌ 门禁执行失败: ${failedItem.command} (exit: ${failedItem.exitCode})\n`,
          );
          if (failedItem.stdout) {
            process.stderr.write(`\n--- stdout ---\n${failedItem.stdout}`);
          }
          if (failedItem.stderr) {
            process.stderr.write(`\n--- stderr ---\n${failedItem.stderr}`);
          }
          process.exitCode = failedItem.exitCode || 1;
        }
      }
    } else if (json) {
      process.stdout.write(
        `${JSON.stringify({ reference, files, ...plan })}\n`,
      );
    } else {
      process.stdout.write(
        `${plan.commands.join('\n') || '没有待检查的改动。'}\n\n${plan.notes.join('\n')}\n`,
      );
      process.stdout.write(
        '\n提示：若需执行上述检查，请添加 --run (如 pnpm run check:daily -- --run)\n',
      );
    }
  } catch (error) {
    if (json)
      process.stdout.write(`${JSON.stringify({ error: error.message })}\n`);
    else process.stderr.write(`无法生成检查建议：${error.message}\n`);
    process.exitCode = 2;
  }
}
