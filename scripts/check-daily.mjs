import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
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

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2).filter((arg) => arg !== '--');
    if (args.length === 1 && ['--help', '-h'].includes(args[0])) {
      process.stdout.write(
        'Usage: pnpm run check:daily [-- --base <ref>]\n只打印建议，不执行检查或修改文件。范围含分支差异、暂存、未暂存和未跟踪文件。\n',
      );
    } else {
      if (args.length > 0 && (args.length !== 2 || args[0] !== '--base')) {
        throw new Error('Usage: pnpm run check:daily [-- --base <ref>]');
      }
      const root = process.cwd();
      const { files, reference } = changedFiles(root, args[1]);
      const plan = planChecks(files, root, !reference);
      process.stdout.write(
        `基准：${reference ?? '未知（仅工作区可见）'}\n改动：${files.length} 个文件；类型：${plan.kinds.join('、') || '无'}\n\n`,
      );
      process.stdout.write(
        `${plan.commands.join('\n') || '没有待检查的改动。'}\n\n${plan.notes.join('\n')}\n`,
      );
    }
  } catch (error) {
    process.stderr.write(`无法生成检查建议：${error.message}\n`);
    process.exitCode = 2;
  }
}
