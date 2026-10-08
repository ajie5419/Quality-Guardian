import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const root = process.cwd();
const start = '<!-- docs:sync-start -->';
const end = '<!-- docs:sync-end -->';
const humanPrefix =
  '# 人工业务说明\r\n\r\nFAIL 保持 INSPECTING，审批结论不得改写。\r\n';
const humanSuffix =
  '\r\n## 人工待办\r\n- 未验证生产数据，保留其他人的未提交说明。\r\n';
const state = `${humanPrefix}${start}\n\n- 版本: 0.0.1\n- 后端模块数: 1\n- 模块 TS 文件数: 1\n\n${end}${humanSuffix}`;

function fixture() {
  const directory = mkdtempSync(path.join(tmpdir(), 'qgs-docs-guidance-'));
  const write = (name: string, content: string) => {
    mkdirSync(path.dirname(path.join(directory, name)), { recursive: true });
    writeFileSync(path.join(directory, name), content);
  };
  for (const file of ['check-docs-drift.sh', 'sync-project-state.sh']) {
    write(
      `scripts/${file}`,
      readFileSync(path.join(root, 'scripts', file), 'utf8'),
    );
  }
  write('package.json', '{"version":"0.0.1"}');
  write(
    'apps/backend/modules/example/example.service.ts',
    'export const example = 1;',
  );
  write('apps/backend/modules/example/ARCHITECTURE.md', '# Example module');
  write(
    'code_map.md',
    '## 后端业务模块\n\n- **example/** — 测试模块\n\n## 后端 API 路由\n',
  );
  write('PROJECT_STATE.md', state);
  const read = (name: string) =>
    readFileSync(path.join(directory, name), 'utf8');
  const run = (file: string) => {
    const result = spawnSync('bash', [path.join(directory, 'scripts', file)], {
      cwd: directory,
      encoding: 'utf8',
    });
    return {
      status: result.status,
      output: `${result.stdout}${result.stderr}`,
    };
  };
  return { directory, write, read, run };
}

describe('documentation drift repair guidance', () => {
  it('passes matching facts without modifying the state document', () => {
    const { directory, read, run } = fixture();
    try {
      const before = read('PROJECT_STATE.md');
      const result = run('check-docs-drift.sh');
      expect(result.status).toBe(0);
      expect(result.output).toContain('docs drift check PASSED');
      expect(result.output).not.toContain('数字漂移修复');
      expect(read('PROJECT_STATE.md')).toBe(before);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('blocks real version/module/file drift, guides sync and preserves human text', () => {
    const { directory, write, read, run } = fixture();
    try {
      write('package.json', '{"version":"0.0.2"}');
      write(
        'apps/backend/modules/second/second.service.ts',
        'export const second = 2;',
      );
      write('apps/backend/modules/second/ARCHITECTURE.md', '# Second module');
      write(
        'code_map.md',
        '## 后端业务模块\n- **example/** — 测试模块\n- **second/** — 第二模块\n',
      );
      const before = read('PROJECT_STATE.md');
      const failure = run('check-docs-drift.sh');
      expect(failure.status).toBe(1);
      for (const kind of [
        'version drift',
        'module-count drift',
        'module-TS-file drift',
      ]) {
        expect(failure.output).toContain(kind);
      }
      expect(failure.output).toContain('pnpm run docs:sync');
      expect(failure.output).toContain('rtk git diff -- PROJECT_STATE.md');
      expect(read('PROJECT_STATE.md')).toBe(before);
      expect(run('sync-project-state.sh').status).toBe(0);
      const synced = read('PROJECT_STATE.md');
      expect(synced.slice(0, synced.indexOf(start))).toBe(humanPrefix);
      expect(synced.slice(synced.indexOf(end) + end.length)).toBe(humanSuffix);
      expect(synced).toContain('- 版本: 0.0.2');
      expect(synced).toContain('- 后端模块数: 2');
      expect(synced).toContain('- 模块 TS 文件数: 2');
      expect(run('check-docs-drift.sh').status).toBe(0);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('keeps missing or obsolete map entries blocking after numeric sync', () => {
    const { directory, write, read, run } = fixture();
    try {
      write('code_map.md', '## 后端业务模块\n- **removed/** — 已删除模块\n');
      const before = read('code_map.md');
      const result = run('check-docs-drift.sh');
      expect(result.status).toBe(1);
      expect(result.output).toContain("D2 module 'example' missing");
      expect(result.output).toContain(
        "D3 code_map.md references module 'removed'",
      );
      expect(result.output).toContain('不能用同步数字解决 D2/D3');
      expect(result.output).not.toContain('数字漂移修复');
      expect(run('sync-project-state.sh').status).toBe(0);
      expect(read('code_map.md')).toBe(before);
      expect(run('check-docs-drift.sh').status).toBe(1);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('explains missing state/map documents without inventing business descriptions', () => {
    const { directory, read, run } = fixture();
    try {
      const before = read('PROJECT_STATE.md');
      rmSync(path.join(directory, 'code_map.md'));
      expect(run('check-docs-drift.sh').output).toContain(
        'D2 code_map.md missing',
      );
      expect(run('check-docs-drift.sh').status).toBe(1);
      expect(read('PROJECT_STATE.md')).toBe(before);
      rmSync(path.join(directory, 'PROJECT_STATE.md'));
      const missingState = run('check-docs-drift.sh');
      expect(missingState.status).toBe(1);
      expect(missingState.output).toContain('docs:sync 不负责创建该文件');
      expect(run('sync-project-state.sh').status).toBe(1);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('keeps missing module architecture informational and gives a targeted remedy', () => {
    const { directory, read, run } = fixture();
    try {
      const before = read('PROJECT_STATE.md');
      rmSync(
        path.join(directory, 'apps/backend/modules/example/ARCHITECTURE.md'),
      );
      const result = run('check-docs-drift.sh');
      expect(result.status).toBe(0);
      expect(result.output).toContain('informational, not blocking');
      expect(result.output).toContain('不生成业务架构说明');
      expect(read('PROJECT_STATE.md')).toBe(before);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('rejects missing, duplicate or reversed sync markers without writing any content', () => {
    const { directory, write, read, run } = fixture();
    try {
      for (const invalid of [
        humanPrefix + humanSuffix,
        humanPrefix + start + humanSuffix,
        `${state}\n${start}${end}`,
        state
          .replace(start, end)
          .replace(`${end}${humanSuffix}`, `${start}${humanSuffix}`),
      ]) {
        write('PROJECT_STATE.md', invalid);
        const result = run('sync-project-state.sh');
        expect(result.status).toBe(1);
        expect(result.output).toContain('未修改文件');
        expect(read('PROJECT_STATE.md')).toBe(invalid);
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
