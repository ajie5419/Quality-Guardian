import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { describe, expect, it } from 'vitest';

const ROOT_DIR = process.cwd();
const CHECK_SCRIPT = path.join(ROOT_DIR, 'scripts/check-qms-architecture.sh');

interface CheckResult {
  output: string;
  status: null | number;
}

function writeFixtureFile(rootDir: string, filePath: string, content: string) {
  const absolutePath = path.join(rootDir, filePath);
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, content, 'utf8');
}

function runGit(rootDir: string, args: string[]) {
  const result = spawnSync('git', args, {
    cwd: rootDir,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout);
  }
}

function createFixture(files: Record<string, string>, baseline = '') {
  const rootDir = mkdtempSync(path.join(tmpdir(), 'qms-architecture-'));
  writeFixtureFile(rootDir, 'scripts/qms-architecture-baseline.txt', baseline);
  for (const [filePath, content] of Object.entries(files)) {
    writeFixtureFile(rootDir, filePath, content);
  }
  runGit(rootDir, ['init', '--quiet']);
  runGit(rootDir, ['add', '.']);
  return rootDir;
}

function runCheck(rootDir: string): CheckResult {
  const result = spawnSync('bash', [CHECK_SCRIPT, '--all'], {
    cwd: ROOT_DIR,
    encoding: 'utf8',
    env: {
      ...process.env,
      QMS_ARCH_BASELINE: path.join(
        rootDir,
        'scripts/qms-architecture-baseline.txt',
      ),
      QMS_ARCH_ROOT_DIR: rootDir,
    },
  });
  return {
    output: `${result.stdout}${result.stderr}`,
    status: result.status,
  };
}

describe('qms architecture check', () => {
  it('reports every guarded backend source violation', () => {
    const filler = Array.from(
      { length: 500 },
      (_, index) => `const filler${index} = ${index};`,
    ).join('\n');
    const rootDir = createFixture({
      'apps/backend/modules/bad/bad.service.ts': `
import { OtherService } from '~/modules/other/internal.service';

const source: unknown = 'value';
const bypass = source as any;
const forced = source as unknown as string;
const asserted = forced!;
const generatedId = Date.now();
console.error(bypass, asserted, generatedId, OtherService);

if (forced === '中文状态') {
  console.log(forced);
}

try {
  throw new Error('empty');
} catch {}

try {
  throw new Error('unlogged');
} catch (error) {
  void error;
}

${filler}
`,
    });

    try {
      const result = runCheck(rootDir);
      expect(result.status).toBe(1);
      for (const rule of [
        'B-S1',
        'B-S4',
        'B-S5',
        'B-T1',
        'B-T2',
        'B-T3',
        'B-M1',
        'B-M2',
        'B-E1',
        'B-E2',
      ]) {
        expect(result.output).toContain(`[${rule}]`);
      }
    } finally {
      rmSync(rootDir, { force: true, recursive: true });
    }
  });

  it('allows timing calls, module entry imports, logged catches, and test assertions', () => {
    const rootDir = createFixture({
      'apps/backend/modules/clean/clean.service.ts': `
import { OtherService } from '~/modules/other';

const logger = { error: (...args: unknown[]) => args };

export function runCleanOperation() {
  const startedAt = Date.now();
  try {
    return OtherService.run();
  } catch (error) {
    logger.error({ err: error }, 'Clean operation failed');
    return Date.now() - startedAt;
  }
}
`,
      'apps/backend/modules/clean/clean.service.test.ts': `
const fixture = { value: 'test' } as any;
const value = fixture.value!;
void value;
`,
    });

    try {
      const result = runCheck(rootDir);
      expect(result.status).toBe(0);
      expect(result.output).toContain('QMS architecture check passed.');
    } finally {
      rmSync(rootDir, { force: true, recursive: true });
    }
  });

  it('blocks source debt that grows beyond the recorded baseline count', () => {
    const sourcePath = 'apps/backend/modules/debt/debt.service.ts';
    const rootDir = createFixture(
      {
        [sourcePath]: `
const first = 'one' as unknown as string;
const second = 'two' as unknown as string;
void first;
void second;
`,
      },
      `B-T2|${sourcePath}|double-assertion|1\n`,
    );

    try {
      const result = runCheck(rootDir);
      expect(result.status).toBe(1);
      expect(result.output).toContain('Baseline B-T2:');
      expect(result.output).toContain('[B-T2]');
    } finally {
      rmSync(rootDir, { force: true, recursive: true });
    }
  });

  it('blocks name-based identity selectors, events, and controlled writes', () => {
    const rootDir = createFixture({
      'apps/web-antd/src/views/qms/example/BadSelect.vue': `
<script setup lang="ts">
const options = {
  valueKey:
    'name',
};
void options;
</script>
<template><div /></template>
`,
      'apps/backend/modules/inspection/identity-violations.service.ts': `
const issuePayload = {
  supplierNames: ['Supplier A'],
};
eventBus.emit('inspection_issue.changed', issuePayload);

eventBus.emit('after_sales.changed', {
  supplierBrands: ['Supplier A'],
});

eventBus.emit('inspection_record.changed', {
  supplierIds: ['supplier-1'],
  supplierNames: ['Supplier A'],
  teamNames: ['Team A'],
  teams: ['Team A'],
});

eventBus.emit('after_sales.changed', {
  supplierBrands: ['Supplier A'],
  supplierIds: ['supplier-1'],
});

const issueData = { supplierName: 'Supplier A' };
prisma.quality_records.create({ data: issueData });
tx.inspections.update({
  where: { id: 'inspection-1' },
  data: { supplierName: 'Supplier A' },
});
`,
      'apps/backend/modules/after-sales/after-sales-integration.service.ts': `
prisma.after_sales.findMany({
  where: { supplierBrand: { in: ['Supplier A'] } },
});
`,
      'apps/backend/modules/supplier/supplier-score-snapshot.service.ts': `
const supplierByName = new Map();
supplierByName.get('Supplier A');
MasterDataGovernanceKernel.resolveCanonicalIdsByNames({
  configKey: 'team',
  names: ['Supplier A'],
});
`,
      'apps/web-antd/src/views/qms/supplier/components/SupplierDetailDrawer.vue': `
<script setup lang="ts">
getAfterSalesList({ supplierBrand: row.name });
</script>
<template><div /></template>
`,
      'apps/backend/modules/inspection/legacy-import.service.ts': `
buildGovernedCanonicalWritePairForTable('quality_records', data, {
  mode: 'legacy-import',
});
prisma.quality_records.create({
  data: { supplierName: 'Legacy Supplier' },
});
`,
    });

    try {
      const result = runCheck(rootDir);
      expect(result.status).toBe(1);
      expect(result.output).toContain('[B-ID1]');
      expect(result.output).toContain('[B-ID2]');
      expect(result.output).toContain('[B-ID3]');
      expect(result.output).toContain('[B-ID4]');
      expect(result.output).toContain('[B-ID5]');
      expect(result.output).toContain('legacy-import.service.ts');
    } finally {
      rmSync(rootDir, { force: true, recursive: true });
    }
  });

  it('allows canonical identity pairs and empty event name arrays', () => {
    const rootDir = createFixture({
      'apps/web-antd/src/views/qms/example/GoodSelect.vue': `
<script setup lang="ts">
const valueMode = 'id';
const options = {
  valueKey: valueMode === 'id' ? 'id' : 'name',
};
void options;
</script>
<template><div /></template>
`,
      'apps/backend/modules/inspection/identity-pairs.service.ts': `
const issuePayload = {
  supplierIds: ['supplier-1'],
  supplierNames: ['Supplier A'],
};
eventBus.emit('inspection_issue.changed', issuePayload);

eventBus.emit('inspection_record.changed', {
  supplierNames: [],
  teamNames: [],
});

const issueData = {
  supplierId: 'supplier-1',
  supplierName: 'Supplier A',
};
prisma.quality_records.create({ data: issueData });
tx.inspections.upsert({
  where: { id: 'inspection-1' },
  create: {
    supplierId: 'supplier-1',
    supplierName: 'Supplier A',
  },
  update: {
    supplierId: 'supplier-1',
    supplierName: 'Supplier A',
  },
});
`,
    });

    try {
      const result = runCheck(rootDir);
      expect(result.status).toBe(0);
      expect(result.output).toContain('QMS architecture check passed.');
    } finally {
      rmSync(rootDir, { force: true, recursive: true });
    }
  });

  it('blocks name-based inspection statistics and unguarded TEAM mutations', () => {
    const rootDir = createFixture({
      'apps/backend/modules/dictionary/dictionary.service.ts': `
function ensureGenericMutationAllowed(dictType: string) {
  void dictType;
}

export const DictionaryService = {
  async create(data: { dictType: string }) {
    ensureGenericMutationAllowed(data.dictType);
  },
  async delete() {},
  async update() {},
};
`,
      'apps/backend/modules/inspection/inspection-request-stats.service.ts': `
export function collectStats(items: Array<{ supplierName: string; team: string }>) {
  const counts = new Map<string, number>();
  for (const item of items) {
    counts.set(item.team, (counts.get(item.supplierName) || 0) + 1);
    counts.set(item.processName, 1);
  }
  return counts;
}
`,
      'apps/backend/scripts/legacy-team-bootstrap.ts': `
export function bootstrapTeams() {}
`,
    });

    try {
      const result = runCheck(rootDir);
      expect(result.status).toBe(1);
      expect(result.output).toContain('[B-ID6]');
      expect(result.output).toContain('[B-ID7]');
      expect(result.output).toContain('DictionaryService.delete');
      expect(result.output).toContain('DictionaryService.update');
      expect(result.output).toContain('legacy-team-bootstrap.ts');
    } finally {
      rmSync(rootDir, { force: true, recursive: true });
    }
  });

  it('allows ID-based inspection statistics and guarded dictionary mutations', () => {
    const rootDir = createFixture({
      'apps/backend/modules/dictionary/dictionary.service.ts': `
function ensureGenericMutationAllowed(dictType: string) {
  void dictType;
}

export const DictionaryService = {
  async create(data: { dictType: string }) {
    ensureGenericMutationAllowed(data.dictType);
  },
  async delete(existing: { dictType: string }) {
    ensureGenericMutationAllowed(existing.dictType);
  },
  async update(existing: { dictType: string }) {
    ensureGenericMutationAllowed(existing.dictType);
  },
};
`,
      'apps/backend/modules/inspection/inspection-request-stats.service.ts': `
export function collectStats(items: Array<{ supplierId: string; teamId: string }>) {
  const counts = new Map<string, number>();
  for (const item of items) {
    counts.set(item.teamId, (counts.get(item.supplierId) || 0) + 1);
  }
  return counts;
}
`,
    });

    try {
      const result = runCheck(rootDir);
      expect(result.status).toBe(0);
      expect(result.output).toContain('QMS architecture check passed.');
    } finally {
      rmSync(rootDir, { force: true, recursive: true });
    }
  });

  it('derives controlled aggregation rules from the master-data registry', () => {
    const rootDir = createFixture({
      'apps/backend/utils/master-data-fields.ts': `
const MASTER_DATA_FIELDS = [{
  key: 'defectType',
  targets: [{
    table: 'quality_records',
    nameColumn: 'defectType',
    idColumn: 'defectTypeId',
    nullable: true,
  }],
}];
`,
      'apps/backend/modules/inspection/bad-stats.service.ts': `
prisma.quality_records.groupBy({
  by: ['defectType'],
  where: { isDeleted: false },
});
`,
      'apps/backend/modules/inspection/good-stats.service.ts': `
prisma.quality_records.groupBy({
  by: ['defectTypeId'],
  where: { isDeleted: false },
});
`,
    });

    try {
      const result = runCheck(rootDir);
      expect(result.status).toBe(1);
      expect(result.output).toContain('[B-ID8]');
      expect(result.output).toContain('group by defectTypeId');
      expect(result.output).not.toContain('good-stats.service.ts');
    } finally {
      rmSync(rootDir, { force: true, recursive: true });
    }
  });
});
