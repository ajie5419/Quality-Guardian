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
import process from 'node:process';

import { describe, expect, it } from 'vitest';

import { formatRuleHelp, ruleHelp } from './qms-rule-help.mjs';

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

function runCheck(
  rootDir: string,
  environment: NodeJS.ProcessEnv = {},
): CheckResult {
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
      ...environment,
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
        expect(result.output).toContain(`规则 ${rule} 原因：`);
      }
      expect(result.output).toContain('修复：');
      expect(result.output).toContain('范例：');
      expect(result.output).toContain('参考：');
      expect(result.output.match(/规则 B-T1 原因：/g)).toHaveLength(1);
    } finally {
      rmSync(rootDir, { force: true, recursive: true });
    }
  });

  it('allows timing calls, module entry imports, logged catches, and test assertions', () => {
    const rootDir = createFixture({
      'apps/backend/modules/clean/clean.service.ts': `
import { OtherService } from '~/modules/other';
import { logApiWarn } from '~/utils/api-logger';

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

export async function runRetryLoop() {
  for (let attempt = 1; ; attempt++) {
    try {
      return await Promise.resolve('ok');
    } catch (error) {
      if (attempt >= 3) throw error;
      logApiWarn('clean', 'transient conflict, retrying', { attempt, err: error });
    }
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

  it('blocks direct and locally aliased governed names as Map keys', () => {
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
      'apps/backend/modules/report/bad-map-stats.service.ts': `
export function collect(rows: Array<{ defectType: string }>) {
  const direct = new Map<string, number>();
  const indirect = new Map<string, number>();
  for (const row of rows) {
    direct.set(row.defectType, (direct.get(row.defectType) || 0) + 1);
    const key = row.defectType;
    indirect.set(key, (indirect.get(key) || 0) + 1);
  }
  return { direct, indirect };
}
`,
      'apps/backend/modules/report/good-map-stats.service.ts': `
export function collect(rows: Array<{
  defectTypeId: string;
  filename: string;
  month: string;
  status: string;
}>) {
  const identityCounts = new Map<string, number>();
  const monthCounts = new Map<string, number>();
  const statusCounts = new Map<string, number>();
  const files = new Map<string, string>();
  for (const row of rows) {
    identityCounts.set(row.defectTypeId, 1);
    monthCounts.set(row.month, 1);
    statusCounts.set(row.status, 1);
    files.set(row.filename, row.filename);
  }
  return { files, identityCounts, monthCounts, statusCounts };
}
`,
    });

    try {
      const result = runCheck(rootDir);
      expect(result.status).toBe(1);
      expect(result.output).toContain('[B-ID9]');
      expect(result.output).toContain('display snapshot');
      expect(result.output).not.toContain('good-map-stats.service.ts');
    } finally {
      rmSync(rootDir, { force: true, recursive: true });
    }
  });

  it('enforces prisma schema field naming rules', () => {
    const rootDir = createFixture({
      'apps/backend/prisma/schema.prisma': `
model naming_ok {
  id        String   @id @default(cuid())
  isActive  Boolean  @default(true)
  hasOwner  Boolean  @default(false)
  createdAt DateTime @default(now())
  closeDate DateTime
  updatedAt DateTime @updatedAt
}

model naming_bad {
  id         String   @id @default(cuid())
  active     Boolean  @default(true)
  examPassed Boolean  @default(false)
  plannedOn  DateTime
  created_at DateTime @default(now())
  due_date   String
}
`,
    });

    try {
      const result = runCheck(rootDir);
      expect(result.status).toBe(1);
      expect(result.output).toContain('[B-N1]');
      expect(result.output).toContain('[B-N2]');
      expect(result.output).toContain('[B-N3]');
      expect(result.output).toContain('naming_bad.created_at');
    } finally {
      rmSync(rootDir, { force: true, recursive: true });
    }
  });

  it('grandfathers baselined field naming violations', () => {
    const rootDir = createFixture(
      {
        'apps/backend/prisma/schema.prisma': `
model naming_legacy {
  id         String   @id @default(cuid())
  active     Boolean  @default(true)
  examPassed Boolean  @default(false)
  plannedOn  DateTime
  created_at DateTime @default(now())
  due_date   String
}
`,
      },
      [
        'B-N1|apps/backend/prisma/schema.prisma|field-active|1',
        'B-N1|apps/backend/prisma/schema.prisma|field-examPassed|1',
        'B-N2|apps/backend/prisma/schema.prisma|field-plannedOn|1',
        'B-N3|apps/backend/prisma/schema.prisma|field-created_at|1',
        'B-N3|apps/backend/prisma/schema.prisma|field-due_date|1',
      ].join('\n'),
    );

    try {
      const result = runCheck(rootDir);
      expect(result.status).toBe(0);
      expect(result.output).toContain('Baseline B-N1');
      expect(result.output).toContain('Baseline B-N3');
      expect(result.output).toContain('QMS architecture check passed.');
    } finally {
      rmSync(rootDir, { force: true, recursive: true });
    }
  });

  it('enforces metric registration for new aggregations', () => {
    const rootDir = createFixture({
      'apps/backend/modules/bad/bad-metric.service.ts': `
import prisma from '~/utils/prisma';

export const BadMetricService = {
  async getNewMetric() {
    return prisma.quality_records.groupBy({
      by: ['defectCategoryId'],
      _count: { id: true },
    });
  },
};
`,
    });

    try {
      const result = runCheck(rootDir);
      expect(result.status).toBe(1);
      expect(result.output).toContain('[B-MF]');
      expect(result.output).toContain('getNewMetric');
    } finally {
      rmSync(rootDir, { force: true, recursive: true });
    }
  });

  it('allows registered and exempt metric aggregation points', () => {
    const rootDir = createFixture({
      'apps/backend/modules/good/good-metric.service.ts': `
import prisma from '~/utils/prisma';

export const GoodMetricService = {
  async getKnownMetric() {
    return prisma.quality_records.groupBy({
      by: ['defectCategoryId'],
      _count: { id: true },
    });
  },
};
`,
      'apps/backend/utils/metrics-registry.ts': `
export const METRIC_REGISTRY: Array<{ id: string }> = [{ id: 'M-Z01' }];
export const EXEMPT_AGGREGATION_POINTS: string[] = [
  'modules/good/good-metric.service.ts#getKnownMetric',
];
`,
      'docs/metrics-registry.md': `
| ID | key |
| --- | --- |
| M-Z01 | knownMetric |
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

  it('blocks seed side effects inside GET routes', () => {
    const rootDir = createFixture({
      'apps/backend/api/qms/demo/seed.get.ts': `
import { defineEventHandler } from 'h3';
import { demoSeed } from '~/modules/demo/demo-seed.service';

export default defineEventHandler(async () => {
  await demoSeed();
  return { ok: true };
});
`,
    });

    try {
      const result = runCheck(rootDir);
      expect(result.status).toBe(1);
      expect(result.output).toContain('[R-GET]');
    } finally {
      rmSync(rootDir, { force: true, recursive: true });
    }
  });

  it('blocks bare-id prisma writes in protected modules', () => {
    const rootDir = createFixture({
      'apps/backend/modules/inspection/inspection-demo.service.ts': `
import prisma from '~/utils/prisma';

export async function updateInspection(id: string, data: unknown) {
  return prisma.inspections.update({
    where: { id },
    data,
  });
}
`,
    });

    try {
      const result = runCheck(rootDir);
      expect(result.status).toBe(1);
      expect(result.output).toContain('[R-SCOPE]');
    } finally {
      rmSync(rootDir, { force: true, recursive: true });
    }
  });

  it('blocks R-SCOPE deformations, tx/batch writes, helper escapes, and unscoped raw SQL', () => {
    const rootDir = createFixture({
      'apps/backend/modules/inspection/inspection-deform.service.ts': `
import prisma from '~/utils/prisma';

export async function softDelete(id: string) {
  return prisma.inspections.update({
    where: { id, isDeleted: false },
    data: { isDeleted: true },
  });
}
`,
      'apps/backend/modules/work-order/work-order-deform.service.ts': `
import prisma from '~/utils/prisma';

export async function remove(workOrderNumber: string) {
  return prisma.work_orders.delete({
    where: { workOrderNumber },
  });
}
`,
      'apps/backend/modules/inspection/inspection-tx.service.ts': `
import prisma from '~/utils/prisma';

export async function updateInspection(id: string) {
  return prisma.$transaction(async (tx) => {
    return tx.inspections.update({ where: { id }, data: {} });
  });
}
`,
      'apps/backend/modules/after-sales/after-sales-batch.service.ts': `
import prisma from '~/utils/prisma';

export async function batchDelete(ids: string[]) {
  return prisma.after_sales.updateMany({
    where: { id: { in: ids } },
    data: { isDeleted: true },
  });
}
`,
      'apps/backend/utils/inspection-helper.ts': `
import prisma from '~/utils/prisma';

export async function touch(id: string) {
  return prisma.inspections.update({ where: { id }, data: {} });
}
`,
      'apps/backend/modules/inspection/inspection-options-tx.service.ts': `
import prisma from '~/utils/prisma';

export async function linkIssue(options: { tx: unknown; id: string }) {
  return options.tx.quality_records.update({
    where: { id: options.id },
    data: {},
  });
}
`,
      'apps/backend/modules/inspection/inspection-raw.service.ts': `
import prisma from '~/utils/prisma';

export async function count() {
  return prisma.$queryRaw\`SELECT COUNT(*) FROM inspections\`;
}
`,
    });

    try {
      const result = runCheck(rootDir);
      expect(result.status).toBe(1);
      expect(result.output).toContain('[R-SCOPE]');
      expect(result.output).toContain('[R-SCOPE-RAW]');
      expect(result.output).toContain('inspection-helper.ts');
      expect(result.output).toContain('work-order-deform.service.ts');
    } finally {
      rmSync(rootDir, { force: true, recursive: true });
    }
  });

  it('allows scoped writes, CAS guards, leases, and explicit R-SCOPE markers', () => {
    const rootDir = createFixture({
      'apps/backend/modules/quality-loss/quality-loss-scoped.service.ts': `
import prisma from '~/utils/prisma';

export async function batchDelete(context: unknown, ids: string[]) {
  return prisma.quality_losses.updateMany({
    where: await buildDeleteScopeWhere(context, {
      id: { in: ids },
      isDeleted: false,
    }),
    data: { isDeleted: true },
  });
}
`,
      'apps/backend/modules/inspection/inspection-cas.service.ts': `
import prisma from '~/utils/prisma';

export async function close(id: string) {
  return prisma.inspections.updateMany({
    where: { id, isDeleted: false, status: { not: 'CLOSED' } },
    data: { status: 'CLOSED' },
  });
}
`,
      'apps/backend/modules/quality-loss/quality-loss-lease.service.ts': `
import prisma from '~/utils/prisma';

export async function fail(workerId: string, source: string, sourcePk: string) {
  return prisma.quality_loss_index_jobs.updateMany({
    where: { leaseOwner: workerId, source, sourcePk, status: 'PROCESSING' },
    data: { status: 'FAILED' },
  });
}
`,
      'apps/backend/modules/inspection/inspection-marked.service.ts': `
import prisma from '~/utils/prisma';

export async function closeEffect(id: string) {
  // qms-arch-allow R-SCOPE: close-flow side effect; id derives from the authorized request
  return prisma.inspections.update({ where: { id }, data: {} });
}
`,
      'apps/backend/modules/inspection/inspection-seq.service.ts': `
import prisma from '~/utils/prisma';

export async function next() {
  // qms-arch-allow R-SCOPE-RAW: sequence generator, internal table only
  return prisma.$queryRaw\`SELECT currentValue FROM sequences\`;
}
`,
      'apps/backend/modules/inspection/inspection-repo.service.ts': `
import { createScopedRepository } from '~/modules/data-scope';

export async function touch(id: string) {
  const repo = createScopedRepository('inspection', prisma.inspections);
  return repo.updateAccessible(
    { where: { id }, data: {} },
    { user: { id: '1' } },
  );
}
`,
    });

    try {
      const result = runCheck(rootDir);
      expect(result.status).toBe(0);
      expect(result.output).not.toContain('[R-SCOPE]');
    } finally {
      rmSync(rootDir, { force: true, recursive: true });
    }
  });

  it('optimistic-lock-001: version alone never exempts a bare write; scoped versioned writes are allowed', () => {
    const rootDir = createFixture({
      'apps/backend/modules/after-sales/after-sales-version-bare.service.ts': `
import prisma from '~/utils/prisma';

export async function touch(id: string, version: number) {
  return prisma.after_sales.updateMany({
    where: { id, version },
    data: { name: 'x', version: { increment: 1 } },
  });
}
`,
      'apps/backend/modules/work-order/work-order-version-bare.service.ts': `
import prisma from '~/utils/prisma';

export async function touch(workOrderNumber: string, version: number) {
  return prisma.work_orders.updateMany({
    where: { workOrderNumber, version, isDeleted: false },
    data: { status: 'x', version: { increment: 1 } },
  });
}
`,
      'apps/backend/modules/supplier/supplier-repo-versioned.service.ts': `
import { createScopedRepository } from '~/modules/data-scope';

export async function touch(id: string, expectedVersion: number) {
  const repo = createScopedRepository('supplier', prisma.suppliers);
  return repo.updateAccessibleVersioned(
    { where: { id }, data: { name: 'x' } },
    { user: { id: '1' } },
    expectedVersion,
  );
}
`,
      'apps/backend/modules/work-order/work-order-scoped-version.service.ts': `
import prisma from '~/utils/prisma';

export async function touch(id: string, version: number, ctx: unknown) {
  return prisma.work_orders.updateMany({
    where: await buildScopedWorkOrderWhere({ version, workOrderNumber: id }, ctx),
    data: { status: 'x', version: { increment: 1 } },
  });
}
`,
      'apps/backend/modules/after-sales/after-sales-cas-version.service.ts': `
import prisma from '~/utils/prisma';

export async function touch(id: string, version: number) {
  return prisma.after_sales.updateMany({
    where: { id, version, status: { not: 'CLOSED' } },
    data: { status: 'CLOSED', version: { increment: 1 } },
  });
}
`,
    });

    try {
      const result = runCheck(rootDir);
      expect(result.status).toBe(1);
      expect(result.output).toContain('after-sales-version-bare.service.ts');
      expect(result.output).toContain('work-order-version-bare.service.ts');
      expect(result.output).not.toContain('supplier-repo-versioned.service.ts');
      expect(result.output).not.toContain(
        'work-order-scoped-version.service.ts',
      );
      expect(result.output).not.toContain('after-sales-cas-version.service.ts');
    } finally {
      rmSync(rootDir, { force: true, recursive: true });
    }
  });

  it('blocks bare reports writes anywhere and allows report ownership-scoped writes', () => {
    const rootDir = createFixture({
      'apps/backend/utils/report-legacy-helper.ts': `
import prisma from '~/utils/prisma';

export async function updateReport(id: string) {
  return prisma.reports.update({ where: { id }, data: {} });
}

export async function deleteReport(id: string) {
  return prisma.reports.delete({ where: { id } });
}
`,
      'apps/backend/modules/report/report-write.service.ts': `
import prisma from '~/utils/prisma';

export function buildReportOwnershipWhere(userinfo: unknown) {
  return { OR: [{ author: 'a' }] };
}

export async function updateReport(
  id: string,
  status: string,
  userinfo: unknown,
) {
  return prisma.reports.updateMany({
    where: {
      id,
      status,
      ...buildReportOwnershipWhere(userinfo),
    },
    data: { totalInspections: 1 },
  });
}

export async function deleteReport(
  id: string,
  status: string,
  userinfo: unknown,
) {
  return prisma.reports.deleteMany({
    where: {
      id,
      status,
      ...buildReportOwnershipWhere(userinfo),
    },
  });
}
`,
    });

    try {
      const result = runCheck(rootDir);
      expect(result.status).toBe(1);
      expect(result.output).toContain('[R-SCOPE]');
      expect(result.output).toContain('report-legacy-helper.ts');
      expect(result.output).not.toContain('report-write.service.ts');
    } finally {
      rmSync(rootDir, { force: true, recursive: true });
    }
  });

  it('blocks bare borrow-domain status writes and allows CAS state transitions', () => {
    const rootDir = createFixture({
      'apps/backend/modules/metrology/borrow/legacy-borrow.service.ts': `
import prisma from '~/utils/prisma';

export async function borrowInstrument(instrumentId: string) {
  const instrument = await prisma.measuring_instruments.findFirst({
    where: { id: instrumentId },
  });
  if (instrument?.borrowStatus !== 'AVAILABLE') return;
  return prisma.metrology_borrow_records.create({
    data: { instrumentId, status: 'BORROWED' },
  });
}

export async function forceReturn(recordId: string) {
  return prisma.metrology_borrow_records.update({
    where: { id: recordId },
    data: { status: 'RETURNED' },
  });
}
`,
      'apps/backend/modules/metrology/borrow/cas-borrow.service.ts': `
import prisma from '~/utils/prisma';

export async function borrowInstrument(instrumentId: string) {
  const claimed = await prisma.measuring_instruments.updateMany({
    where: { id: instrumentId, borrowStatus: 'AVAILABLE' },
    data: { borrowStatus: 'BORROWED' },
  });
  if (claimed.count !== 1) return null;
  return prisma.metrology_borrow_records.create({
    data: { instrumentId, status: 'BORROWED' },
  });
}

export async function confirmReturn(recordId: string, instrumentId: string) {
  const recordClaim = await prisma.metrology_borrow_records.updateMany({
    where: { id: recordId, status: 'RETURN_PENDING' },
    data: { status: 'RETURNED' },
  });
  if (recordClaim.count !== 1) return null;
  return prisma.measuring_instruments.updateMany({
    where: { id: instrumentId, borrowStatus: 'RETURN_PENDING' },
    data: { borrowStatus: 'AVAILABLE' },
  });
}
`,
      // Instrument CRUD outside the borrow directory stays unguarded.
      'apps/backend/modules/metrology/metrology-id.put.service.ts': `
import prisma from '~/utils/prisma';

export async function updateInstrument(id: string) {
  return prisma.measuring_instruments.update({
    where: { id },
    data: { instrumentName: 'Gauge' },
  });
}
`,
    });

    try {
      const result = runCheck(rootDir);
      expect(result.status).toBe(1);
      expect(result.output).toContain('[R-SCOPE]');
      expect(result.output).toContain('legacy-borrow.service.ts');
      expect(result.output).not.toContain('cas-borrow.service.ts');
      expect(result.output).not.toContain('metrology-id.put.service.ts');
    } finally {
      rmSync(rootDir, { force: true, recursive: true });
    }
  });

  it('blocks bare supervision-domain writes and allows scoped CAS state transitions', () => {
    const rootDir = createFixture({
      'apps/backend/modules/supervision/legacy-supervision.service.ts': `
import prisma from '~/utils/prisma';

export async function forceCompleteProject(id: string) {
  return prisma.supervision_projects.update({
    where: { id },
    data: { status: 'COMPLETED' },
  });
}

export async function forceDeleteTask(id: string) {
  return prisma.supervision_plan_tasks.updateMany({
    where: { id, isDeleted: false },
    data: { isDeleted: true },
  });
}

export async function forceCloseIssue(issueId: string) {
  return prisma.supervision_issues.update({
    where: { id: issueId },
    data: { status: 'CLOSED' },
  });
}
`,
      'apps/backend/modules/supervision/scoped-supervision.service.ts': `
import prisma from '~/utils/prisma';
import { buildSupervisionAccessWhere } from './supervision-access';

export async function updateProject(
  id: string,
  status: string,
  context: { userId: string },
) {
  const accessWhere = buildSupervisionAccessWhere('project', context);
  const current = await prisma.supervision_projects.findFirst({
    where: { id, isDeleted: false, ...accessWhere },
  });
  if (!current) return null;
  return prisma.supervision_projects.updateMany({
    data: { status },
    where: { id, isDeleted: false, status: current.status, ...accessWhere },
  });
}

export async function updateTask(
  taskId: string,
  projectId: string,
  context: { userId: string },
) {
  return prisma.supervision_plan_tasks.updateMany({
    data: { isSummary: true },
    where: { id: taskId, projectId, project: { createdBy: context.userId } },
  });
}

export async function syncProgress(projectId: string) {
  // qms-arch-allow R-SCOPE: system-derived write - progress/status recalculated from leaf tasks
  return prisma.supervision_projects.update({
    where: { id: projectId },
    data: { progressPercent: 50 },
  });
}
`,
      // Module-scoped protection deliberately does not guard supervision
      // writes from unrelated modules; no cross-module supervision writer
      // exists today and the rule must not over-generalize.
      'apps/backend/modules/other/other.service.ts': `
import prisma from '~/utils/prisma';

export async function touchProject(id: string) {
  return prisma.supervision_projects.update({
    where: { id },
    data: { summary: 'touched' },
  });
}
`,
    });

    try {
      const result = runCheck(rootDir);
      expect(result.status).toBe(1);
      expect(result.output).toContain('[R-SCOPE]');
      expect(result.output).toContain('legacy-supervision.service.ts');
      expect(result.output).not.toContain('scoped-supervision.service.ts');
      expect(result.output).not.toContain('other.service.ts');
    } finally {
      rmSync(rootDir, { force: true, recursive: true });
    }
  });

  it('blocks unscoped aggregate reads and raw SQL in analytics modules', () => {
    const rootDir = createFixture({
      'apps/backend/modules/report/report-kpi.service.ts': `
import prisma from '~/utils/prisma';

export async function kpi() {
  return prisma.inspections.findMany({
    where: { isDeleted: false },
    select: { quantity: true },
  });
}
`,
      'apps/backend/modules/report/report-raw.service.ts': `
import prisma from '~/utils/prisma';

export async function trend() {
  return prisma.$queryRaw\`SELECT SUM(quantity) FROM inspections\`;
}
`,
      'apps/backend/modules/dashboard/dashboard-count.service.ts': `
import prisma from '~/utils/prisma';

export async function countAll() {
  return prisma.quality_records.count({ where: { isDeleted: false } });
}
`,
    });

    try {
      const result = runCheck(rootDir);
      expect(result.status).toBe(1);
      expect(result.output).toContain('[R-SCOPE-AGG]');
      expect(result.output).toContain('[R-SCOPE-RAW]');
      expect(result.output).toContain('report-kpi.service.ts');
      expect(result.output).toContain('report-raw.service.ts');
      expect(result.output).toContain('dashboard-count.service.ts');
    } finally {
      rmSync(rootDir, { force: true, recursive: true });
    }
  });

  it('allows scoped aggregates and marked projection reads in analytics modules', () => {
    const rootDir = createFixture({
      'apps/backend/modules/report/report-scoped.service.ts': `
import prisma from '~/utils/prisma';
import { buildScopedInspectionWhere } from './pass-rate-scope';

export async function kpi(access: unknown) {
  const where = await buildScopedInspectionWhere({ isDeleted: false }, access);
  return prisma.inspections.findMany({ where, select: { quantity: true } });
}
`,
      'apps/backend/modules/report/report-projection.service.ts': `
import prisma from '~/utils/prisma';

export async function fresh() {
  // qms-arch-allow R-SCOPE-AGG: projection freshness count, maintenance only
  return prisma.inspections.count({ where: { isDeleted: false } });
}
`,
      'apps/backend/modules/report/report-projection-raw.service.ts': `
import prisma from '~/utils/prisma';

export async function stale() {
  // qms-arch-allow R-SCOPE-RAW: projection stale-row probe, maintenance only
  return prisma.$queryRaw\`SELECT id FROM inspections WHERE isDeleted = 0 LIMIT 1\`;
}
`,
    });

    try {
      const result = runCheck(rootDir);
      expect(result.status).toBe(0);
      expect(result.output).not.toContain('[R-SCOPE-AGG]');
      expect(result.output).not.toContain('[R-SCOPE-RAW]');
    } finally {
      rmSync(rootDir, { force: true, recursive: true });
    }
  });

  it('blocks unscoped qms_inspection_requests aggregates in inspection stats files', () => {
    const rootDir = createFixture({
      'apps/backend/modules/inspection/inspection-request-stats-future.service.ts': `
import prisma from '~/utils/prisma';

export async function futureStats() {
  return prisma.qms_inspection_requests.findMany({
    where: { isDeleted: false },
    select: { status: true },
  });
}
`,
      'apps/backend/modules/inspection/inspection-request-stats-count.service.ts': `
import prisma from '~/utils/prisma';

export async function countAll() {
  return prisma.qms_inspection_requests.count({
    where: { isDeleted: false },
  });
}
`,
      // A stats file aggregating a non-guarded model must stay clean, and an
      // ordinary list service must not be caught by the stats-file rule.
      'apps/backend/modules/inspection/inspection-request-stats-process.service.ts': `
import prisma from '~/utils/prisma';

export async function processStats() {
  return prisma.processes.findMany({ where: { isDeleted: false } });
}
`,
      'apps/backend/modules/inspection/inspection-request-list.service.ts': `
import prisma from '~/utils/prisma';

export async function listRequests() {
  return prisma.qms_inspection_requests.findMany({
    where: { isDeleted: false },
  });
}
`,
    });

    try {
      const result = runCheck(rootDir);
      expect(result.status).toBe(1);
      expect(result.output).toContain('[R-SCOPE-AGG]');
      expect(result.output).toContain(
        'inspection-request-stats-future.service.ts',
      );
      expect(result.output).toContain(
        'inspection-request-stats-count.service.ts',
      );
      expect(result.output).not.toContain(
        'inspection-request-stats-process.service.ts',
      );
      expect(result.output).not.toContain('inspection-request-list.service.ts');
    } finally {
      rmSync(rootDir, { force: true, recursive: true });
    }
  });

  it('allows scoped and explicitly marked inspection stats aggregates', () => {
    const rootDir = createFixture({
      'apps/backend/modules/inspection/inspection-request-stats-scoped.service.ts': `
import prisma from '~/utils/prisma';
import { buildScopedInspectionRequestWhere } from './inspection-request-scope';

export async function stats(access: unknown) {
  const where = await buildScopedInspectionRequestWhere(
    { isDeleted: false },
    access,
  );
  return prisma.qms_inspection_requests.findMany({ where });
}
`,
      'apps/backend/modules/inspection/inspection-request-stats-workload.service.ts': `
import prisma from '~/utils/prisma';

export async function workload() {
  // qms-arch-allow R-SCOPE-AGG: per-inspector system-wide workload tally, no business rows exposed
  return prisma.qms_inspection_requests.findMany({
    where: { isDeleted: false },
    select: { inspectorId: true },
  });
}
`,
    });

    try {
      const result = runCheck(rootDir);
      expect(result.status).toBe(0);
      expect(result.output).not.toContain('[R-SCOPE-AGG]');
    } finally {
      rmSync(rootDir, { force: true, recursive: true });
    }
  });

  it('grandfathers baselined seed GET routes and bare-id writes', () => {
    const rootDir = createFixture(
      {
        'apps/backend/api/qms/demo/seed.get.ts': `
import { defineEventHandler } from 'h3';
import { demoSeed } from '~/modules/demo/demo-seed.service';

export default defineEventHandler(async () => {
  await demoSeed();
  return { ok: true };
});
`,
        'apps/backend/modules/inspection/inspection-demo.service.ts': `
import prisma from '~/utils/prisma';

export async function updateInspection(id: string, data: unknown) {
  return prisma.inspections.update({ where: { id }, data });
}
`,
      },
      [
        'R-GET|apps/backend/api/qms/demo/seed.get.ts|seed-in-get-route|1',
        'R-SCOPE|apps/backend/modules/inspection/inspection-demo.service.ts|bare-id-write-inspections.update|1',
        '',
      ].join('\n'),
    );

    try {
      const result = runCheck(rootDir);
      expect(result.status).toBe(0);
      expect(result.output).toContain('Baseline R-GET');
      expect(result.output).toContain('Baseline R-SCOPE');
    } finally {
      rmSync(rootDir, { force: true, recursive: true });
    }
  });

  it('state-machine-001: status writes on protected models require a CAS anchor', () => {
    const rootDir = createFixture({
      'apps/backend/modules/vehicle-commissioning/vc-bare.service.ts': `
import prisma from '~/utils/prisma';

export async function closeIssue(id: string) {
  return prisma.vehicle_commissioning_issues.update({
    where: { id },
    data: { status: 'CLOSED' },
  });
}
`,
      'apps/backend/modules/task-dispatch/td-bare.service.ts': `
import prisma from '~/utils/prisma';

export async function completeTask(id: string) {
  return prisma.qms_task_dispatches.updateMany({
    where: { id, isDeleted: false },
    data: { status: 'COMPLETED' },
  });
}
`,
      'apps/backend/modules/quality-loss/ql-tx-bare.service.ts': `
import prisma from '~/utils/prisma';

export async function confirmLoss(lossId: string) {
  return prisma.$transaction(async (tx) => {
    await tx.quality_losses.update({
      where: { lossId },
      data: { status: 'Confirmed' },
    });
  });
}
`,
      'apps/backend/utils/vc-helper-bare.service.ts': `
import prisma from '~/utils/prisma';

export async function reopenInHelper(id: string) {
  return prisma.vehicle_commissioning_issues.updateMany({
    where: { id },
    data: { status: 'OPEN' },
  });
}
`,
      'apps/backend/modules/vehicle-commissioning/vc-cas.service.ts': `
import prisma from '~/utils/prisma';

export async function closeIssue(id: string) {
  return prisma.vehicle_commissioning_issues.updateMany({
    where: { id, status: 'OPEN' },
    data: { status: 'CLOSED' },
  });
}
`,
      'apps/backend/modules/task-dispatch/td-scoped.service.ts': `
import prisma from '~/utils/prisma';

export async function updateTask(id: string, scopeWhere: unknown) {
  return prisma.qms_task_dispatches.updateMany({
    where: { id, ...scopeWhere },
    data: { status: 'PROCESSING' },
  });
}
`,
      'apps/backend/modules/quality-loss/ql-marked.service.ts': `
import prisma from '~/utils/prisma';

export async function systemFollowUp(id: string) {
  // qms-arch-allow R-SCOPE: system maintenance status follow-up, id derives from authorized parent
  return prisma.quality_losses.updateMany({
    where: { id },
    data: { status: 'Processing' },
  });
}
`,
      'apps/backend/modules/vehicle-commissioning/vc-repo.service.ts': `
import { createScopedRepository } from '~/modules/data-scope';

export async function touch(id: string) {
  const repo = createScopedRepository(
    'vehicle-commissioning',
    prisma.vehicle_commissioning_issues,
  );
  return repo.updateAccessible(
    { where: { id, status: 'OPEN' }, data: { status: 'CLOSED' } },
    { user: { id: '1' } },
  );
}
`,
    });

    try {
      const result = runCheck(rootDir);
      expect(result.status).toBe(1);
      expect(result.output).toContain('[R-SM]');
      expect(result.output).toContain('vc-bare.service.ts');
      expect(result.output).toContain('td-bare.service.ts');
      expect(result.output).toContain('ql-tx-bare.service.ts');
      expect(result.output).toContain('vc-helper-bare.service.ts');
      expect(result.output).not.toContain('vc-cas.service.ts');
      expect(result.output).not.toContain('td-scoped.service.ts');
      expect(result.output).not.toContain('ql-marked.service.ts');
      expect(result.output).not.toContain('vc-repo.service.ts');
    } finally {
      rmSync(rootDir, { force: true, recursive: true });
    }
  });

  it('close-effects-001: inspection documents writes need a snapshot CAS anchor', () => {
    const rootDir = createFixture({
      'apps/backend/modules/inspection/inspection-request-close-effects.service.ts': `
import prisma from '~/utils/prisma';

export async function bareMerge(inspectionId: string) {
  return prisma.inspections.update({
    where: { id: inspectionId },
    data: { documents: '[]' },
  });
}

export async function unrelatedCasMerge(inspectionId: string) {
  return prisma.inspections.updateMany({
    where: { id: inspectionId, status: 'INSPECTING' },
    data: { documents: '[]' },
  });
}

export async function txBareMerge(inspectionId: string) {
  return prisma.$transaction(async (tx) => {
    await tx.inspections.update({
      where: { id: inspectionId },
      data: { documents: '[]' },
    });
  });
}

export async function snapshotCasMerge(
  inspectionId: string,
  documents: unknown,
  selfCheckDocuments: unknown,
) {
  return prisma.inspections.updateMany({
    where: { id: inspectionId, documents, selfCheckDocuments },
    data: { documents, selfCheckDocuments },
  });
}

export async function scopedMerge(inspectionId: string, scopeWhere: unknown) {
  return prisma.inspections.updateMany({
    where: { id: inspectionId, ...scopeWhere },
    data: { documents: '[]' },
  });
}

export async function markedBareMerge(inspectionId: string) {
  // qms-arch-allow R-SCOPE: system maintenance snapshot write, id derives from authorized close
  return prisma.inspections.update({
    where: { id: inspectionId },
    data: { documents: '[]' },
  });
}
`,
    });

    try {
      const result = runCheck(rootDir);
      expect(result.status).toBe(1);
      expect(result.output.match(/\[R-CLOSE-EFFECT\]/g)?.length).toBe(3);
      expect(result.output).toContain(
        'inspection-request-close-effects.service.ts:5',
      );
      expect(result.output).toContain(
        'inspection-request-close-effects.service.ts:12',
      );
      expect(result.output).toContain(
        'inspection-request-close-effects.service.ts:20',
      );
    } finally {
      rmSync(rootDir, { force: true, recursive: true });
    }
  });

  it('idempotency-001: every P1 create entry must wrap its write with the idempotency helper and register its operationKey', () => {
    const protectedEntries = [
      {
        file: 'apps/backend/modules/quality-loss/quality-loss-create.post.service.ts',
        operationKey: 'qms.quality-loss.create',
        resourceType: 'quality_losses',
      },
      {
        file: 'apps/backend/modules/inspection/inspection-request-create.post.service.ts',
        operationKey: 'qms.inspection-request.create',
        resourceType: 'qms_inspection_requests',
      },
      {
        file: 'apps/backend/modules/after-sales/after-sales-create.post.service.ts',
        operationKey: 'qms.after-sales.create',
        resourceType: 'after_sales',
      },
      {
        file: 'apps/backend/modules/inspection/inspection-issue-create.post.service.ts',
        operationKey: 'qms.inspection-nc.create',
        resourceType: 'inspection_issues',
      },
      {
        file: 'apps/backend/modules/inspection/inspection-record-create.post.service.ts',
        operationKey: 'qms.inspection-record.create',
        resourceType: 'inspection_records',
      },
      {
        file: 'apps/backend/modules/vehicle-commissioning/vehicle-commissioning-issue-create.post.service.ts',
        operationKey: 'qms.vehicle-commissioning-issue.create',
        resourceType: 'vehicle_commissioning_issues',
      },
    ];

    for (const entry of protectedEntries) {
      const compliantRootDir = createFixture({
        [entry.file]: `
import { withRequestIdempotency } from '~/modules/idempotency';
import prisma from '~/utils/prisma';

export default async function handler() {
  return withRequestIdempotency({
    actorKey: 'user-1',
    expiresAt: new Date(),
    idempotencyKey: 'client-key-0001',
    operationKey: '${entry.operationKey}',
    prisma,
    requestFingerprint: 'fp',
    run: async () => ({
      resourceId: 'resource-1',
      resourceType: '${entry.resourceType}',
      response: { id: 'resource-1' },
    }),
  });
}
`,
      });
      try {
        const result = runCheck(compliantRootDir);
        expect(result.status).toBe(0);
        expect(result.output).not.toContain('[R-IDEMPOTENCY]');
      } finally {
        rmSync(compliantRootDir, { force: true, recursive: true });
      }

      const bareRootDir = createFixture({
        [entry.file]: `
import prisma from '~/utils/prisma';

export default async function handler() {
  return prisma.${entry.resourceType}.create({
    data: { id: 'resource-1' },
  });
}
`,
      });
      try {
        const result = runCheck(bareRootDir);
        expect(result.status).toBe(1);
        expect(result.output).toContain('[R-IDEMPOTENCY]');
        expect(result.output).toContain(`${entry.file}:1`);
      } finally {
        rmSync(bareRootDir, { force: true, recursive: true });
      }
    }
  }, 60_000);

  it('idempotency-002: a protected create entry must not drift to another operationKey', () => {
    const rootDir = createFixture({
      'apps/backend/modules/inspection/inspection-request-create.post.service.ts': `
import { withRequestIdempotency } from '~/modules/idempotency';
import prisma from '~/utils/prisma';

const INSPECTION_REQUEST_CREATE_OPERATION_KEY = 'qms.after-sales.create';

export default async function handler() {
  return withRequestIdempotency({
    actorKey: 'user-1',
    expiresAt: new Date(),
    idempotencyKey: 'client-key-0001',
    operationKey: INSPECTION_REQUEST_CREATE_OPERATION_KEY,
    prisma,
    requestFingerprint: 'fp',
    run: async () => ({
      resourceId: 'request-1',
      resourceType: 'qms_inspection_requests',
      response: { id: 'request-1' },
    }),
  });
}
`,
    });
    try {
      const result = runCheck(rootDir);
      expect(result.status).toBe(1);
      expect(result.output).toContain('[R-IDEMPOTENCY]');
      expect(result.output).toContain(
        'must reference its registered operationKey literal',
      );
      expect(result.output).toContain(
        'inspection-request-create.post.service.ts:1',
      );
    } finally {
      rmSync(rootDir, { force: true, recursive: true });
    }
  });

  it('bounded-read-001: after-sales list / inspection export / quality-loss export must paginate or bound rows in the database', () => {
    const rootDir = createFixture({
      'apps/backend/modules/after-sales/after-sales.service.ts': `
import prisma from '~/utils/prisma';

export const AfterSalesService = {
  async getList() {
    const list = await prisma.after_sales.findMany({
      where: { isDeleted: false },
    });
    return { items: list.slice(0, 20), total: list.length };
  },
};
`,
      'apps/backend/modules/inspection/inspection-record-query.service.ts': `
import prisma from '~/utils/prisma';

export const InspectionRecordQueryService = {
  async findAllForExport() {
    return prisma.inspections.findMany({
      where: { isDeleted: false },
    });
  },
};
`,
      'apps/backend/modules/quality-loss/quality-loss.service.ts': `
import prisma from '~/utils/prisma';

export const QualityLossService = {
  async getExportRows() {
    return prisma.quality_loss_index.findMany({
      where: { isDeleted: false },
    });
  },
};
`,
    });

    try {
      const result = runCheck(rootDir);
      expect(result.status).toBe(1);
      expect(result.output).toContain('[R-BOUNDED-READ]');
      expect(result.output).toContain(
        'modules/after-sales/after-sales.service.ts:6',
      );
      expect(result.output).toContain(
        'modules/inspection/inspection-record-query.service.ts:6',
      );
      expect(result.output).toContain(
        'modules/quality-loss/quality-loss.service.ts:6',
      );
    } finally {
      rmSync(rootDir, { force: true, recursive: true });
    }
  });

  it('bounded-read-002: compliant list/export entries keep passing', () => {
    const rootDir = createFixture({
      'apps/backend/modules/after-sales/after-sales.service.ts': `
import prisma from '~/utils/prisma';

export const AfterSalesService = {
  async getList(pageSize: number) {
    const skip = 0;
    return prisma.after_sales.findMany({
      where: { isDeleted: false },
      skip,
      take: pageSize,
    });
  },
};
`,
      'apps/backend/modules/inspection/inspection-record-query.service.ts': `
import prisma from '~/utils/prisma';
import { EXPORT_QUERY_TAKE } from '~/utils/export-constants';

export const InspectionRecordQueryService = {
  async findAllForExport() {
    return prisma.inspections.findMany({
      where: { isDeleted: false },
      take: EXPORT_QUERY_TAKE,
    });
  },
};
`,
      'apps/backend/modules/quality-loss/quality-loss.service.ts': `
import prisma from '~/utils/prisma';
import { EXPORT_QUERY_TAKE } from '~/utils/export-constants';

export const QualityLossService = {
  async getExportRows() {
    return prisma.quality_loss_index.findMany({
      where: { isDeleted: false },
      take: EXPORT_QUERY_TAKE,
    });
  },
};
`,
      // Unrelated modules and ordinary list services are not covered by the
      // narrow invariant.
      'apps/backend/modules/supplier/supplier.service.ts': `
import prisma from '~/utils/prisma';

export const SupplierService = {
  async list() {
    return prisma.suppliers.findMany({ where: { isDeleted: false } });
  },
};
`,
    });

    try {
      const result = runCheck(rootDir);
      expect(result.status).toBe(0);
      expect(result.output).not.toContain('[R-BOUNDED-READ]');
    } finally {
      rmSync(rootDir, { force: true, recursive: true });
    }
  });

  it('db-aggregation-001: migrated analytics entries must not regress to full findMany aggregation', () => {
    const rootDir = createFixture({
      'apps/backend/modules/quality-loss/quality-loss.service.ts': `
import prisma from '~/utils/prisma';

export const QualityLossService = {
  async getDashboardSummary() {
    const rows = await prisma.quality_loss_index.findMany({
      where: { isDeleted: false },
    });
    return rows.reduce(
      (sum, row) => sum + Number(row.amount || 0),
      0,
    );
  },
};
`,
      'apps/backend/modules/inspection/inspection-issue-stats.service.ts': `
import prisma from '~/utils/prisma';

export const InspectionIssueStatsService = {
  async getIssueChartAggregation() {
    return prisma.quality_records.findMany({
      where: { isDeleted: false },
    });
  },
};
`,
      'apps/backend/modules/after-sales/after-sales-chart-aggregation.service.ts': `
import prisma from '~/utils/prisma';

export const AfterSalesChartAggregationService = {
  async getReportMonthAggregation() {
    return prisma.after_sales.findMany({
      where: { isDeleted: false },
    });
  },
};
`,
      'apps/backend/modules/work-order/work-order.service.ts': `
import prisma from '~/utils/prisma';

export const WorkOrderService = {
  async getDashboardStats() {
    return prisma.work_orders.findMany({
      where: { isDeleted: false },
    });
  },
};
`,
      'apps/backend/modules/report/pass-rate.ts': `
import prisma from '~/utils/prisma';

export async function getLegacyPassRateDrillDownByRange() {
  return prisma.inspections.findMany({
    where: { isDeleted: false },
  });
}
`,
      'apps/backend/modules/dashboard/dashboard.service.ts': `
import { getNetPassRateSummaryByRange } from '~/modules/report/pass-rate';

export const DashboardService = {
  async getMonthlyTrend() {
    return Promise.all(
      Array.from({ length: 12 }, async () =>
        getNetPassRateSummaryByRange(new Date(), new Date()),
      ),
    );
  },
};
`,
    });

    try {
      const result = runCheck(rootDir);
      expect(result.status).toBe(1);
      expect(result.output).toContain('[R-DB-AGGREGATION]');
      expect(result.output).toContain(
        'modules/quality-loss/quality-loss.service.ts:6',
      );
      expect(result.output).toContain(
        'modules/inspection/inspection-issue-stats.service.ts:6',
      );
      expect(result.output).toContain(
        'modules/after-sales/after-sales-chart-aggregation.service.ts:6',
      );
      expect(result.output).toContain(
        'modules/work-order/work-order.service.ts:6',
      );
      expect(result.output).toContain('modules/report/pass-rate.ts:5');
      expect(result.output).toContain(
        'modules/dashboard/dashboard.service.ts:8',
      );
    } finally {
      rmSync(rootDir, { force: true, recursive: true });
    }
  });

  it('db-aggregation-001: database aggregation and single year-range trend stay allowed', () => {
    const rootDir = createFixture({
      'apps/backend/modules/quality-loss/quality-loss.service.ts': `
import prisma from '~/utils/prisma';

export const QualityLossService = {
  async getTrendData() {
    const [total, bySource] = await Promise.all([
      prisma.quality_loss_index.aggregate({
        where: { isDeleted: false },
        _sum: { amount: true },
      }),
      prisma.quality_loss_index.groupBy({
        by: ['source'],
        where: { isDeleted: false },
        _sum: { amount: true },
      }),
    ]);
    return { total, bySource };
  },
};
`,
      'apps/backend/modules/dashboard/dashboard.service.ts': `
import { getPassRateMonthlyTrend } from '~/modules/report';

export const DashboardService = {
  async getMonthlyTrend(access: unknown) {
    return getPassRateMonthlyTrend(
      new Date('2026-01-01'),
      new Date('2026-12-31'),
      access,
    );
  },
};
`,
      'apps/backend/modules/report/pass-rate.ts': `
import prisma from '~/utils/prisma';
import { buildInspectionRawScopeSql } from './pass-rate-scope';

export async function getLegacyInspectionPassRateSummaryByRange() {
  const scopeSql = await buildInspectionRawScopeSql(undefined);
  return prisma.$queryRaw\`SELECT SUM(quantity) FROM inspections WHERE isDeleted = 0 \${scopeSql}\`;
}
`,
      'apps/backend/utils/metrics-registry.ts': `
export const METRIC_REGISTRY: Array<{
  id: string;
  implementationPoints: string[];
}> = [
  {
    id: 'M-A01',
    implementationPoints: [
      'modules/report/pass-rate.ts#getLegacyInspectionPassRateSummaryByRange',
    ],
  },
  {
    id: 'M-B03',
    implementationPoints: [
      'modules/quality-loss/quality-loss.service.ts#getTrendData',
    ],
  },
];
export const EXEMPT_AGGREGATION_POINTS: string[] = [];
`,
      'docs/metrics-registry.md': `
| M-A01 | pass rate |
| M-B03 | loss trend |
`,
    });

    try {
      const result = runCheck(rootDir);
      expect(result.status).toBe(0);
      expect(result.output).not.toContain('[R-DB-AGGREGATION]');
    } finally {
      rmSync(rootDir, { force: true, recursive: true });
    }
  });

  it('db-aggregation-003: inspection-request-stats must not regress to full findMany aggregation', () => {
    const rootDir = createFixture({
      'apps/backend/modules/inspection/inspection-request-stats.service.ts': `
import prisma from '~/utils/prisma';
import { buildScopedInspectionRequestWhere } from './inspection-request-scope';

export const InspectionRequestStatsService = {
  async getRequestStats() {
    const scope = await buildScopedInspectionRequestWhere(
      { isDeleted: false },
      undefined,
    );
    return prisma.qms_inspection_requests.findMany({
      where: scope,
    });
  },
};
`,
      'apps/backend/modules/inspection/inspection-request-stats-data.ts': `
import { Prisma } from '@prisma/client';
import prisma from '~/utils/prisma';
import { buildScopedInspectionRequestWhere } from './inspection-request-scope';

export async function loadInspectionRequestStatsData() {
  const scope = await buildScopedInspectionRequestWhere(
    { isDeleted: false },
    undefined,
  );
  return prisma.qms_inspection_requests.findMany({
    where: scope,
  });
}
`,
    });

    try {
      const result = runCheck(rootDir);
      expect(result.status).toBe(1);
      expect(result.output).toContain('[R-DB-AGGREGATION]');
      expect(result.output).toContain(
        'modules/inspection/inspection-request-stats.service.ts:11',
      );
      expect(result.output).toContain(
        'modules/inspection/inspection-request-stats-data.ts:11',
      );
      expect(result.output).toContain(
        'The inspection-request-stats period section must be DB pre-aggregated',
      );
      expect(result.output).toContain(
        'The inspection-request-stats data loader must aggregate in the database',
      );
    } finally {
      rmSync(rootDir, { force: true, recursive: true });
    }
  });

  it('db-aggregation-003: scoped raw GROUP BY period stats stay allowed', () => {
    const rootDir = createFixture({
      'apps/backend/modules/inspection/inspection-request-stats.service.ts': `
import { loadInspectionRequestStatsData } from './inspection-request-stats-data';

export const InspectionRequestStatsService = {
  async getRequestStats() {
    return loadInspectionRequestStatsData();
  },
};
`,
      'apps/backend/modules/inspection/inspection-request-stats-data.ts': `
import { Prisma } from '@prisma/client';
import prisma from '~/utils/prisma';
import { buildScopedInspectionRequestWhere } from './inspection-request-scope';

function buildRequestHistoryRawScopeSql() {
  return Prisma.empty;
}

async function loadSubmittedPeriodGroups() {
  const scopeSql = await buildRequestHistoryRawScopeSql();
  return prisma.$queryRaw<Array<{ requestCount: number }>>(Prisma.sql\`
    SELECT COUNT(*) AS requestCount
    FROM qms_inspection_requests AS request_row
    WHERE request_row.isDeleted = 0
      \${scopeSql}
    GROUP BY request_row.category
  \`);
}

async function loadClosedPeriodGroups() {
  const scopeSql = await buildRequestHistoryRawScopeSql();
  return prisma.$queryRaw<Array<{ totalTaskMinutes: number }>>(Prisma.sql\`
    SELECT SUM(GREATEST(FLOOR(TIMESTAMPDIFF(MICROSECOND, COALESCE(
      request_row.dispatchedAt,
      request_row.submittedAt
    ), request_row.closedAt) / 60000000), 0)) AS totalTaskMinutes
    FROM qms_inspection_requests AS request_row
    WHERE request_row.isDeleted = 0
      \${scopeSql}
    GROUP BY request_row.inspectorId
  \`);
}

export async function loadInspectionRequestStatsData() {
  const [submitted, closed] = await Promise.all([
    loadSubmittedPeriodGroups(),
    loadClosedPeriodGroups(),
    prisma.qms_inspection_requests.count({
      where: await buildScopedInspectionRequestWhere(
        { isDeleted: false, status: 'SUBMITTED' },
        undefined,
      ),
    }),
  ]);
  return { closed, submitted };
}
`,
    });

    try {
      const result = runCheck(rootDir);
      expect(result.status).toBe(0);
      expect(result.output).not.toContain('[R-DB-AGGREGATION]');
      expect(result.output).not.toContain('[R-SCOPE-RAW]');
      expect(result.output).not.toContain('[R-SCOPE-AGG]');
    } finally {
      rmSync(rootDir, { force: true, recursive: true });
    }
  });
});

describe('qms repair guidance', () => {
  it('covers every detector rule without changing machine record output', () => {
    for (const file of [
      'scripts/check-qms-architecture.sh',
      'scripts/check-qms-source-rules.mjs',
      'scripts/check-governed-fields.py',
      'scripts/check-field-naming.mjs',
      'scripts/check-metric-registration.mjs',
    ]) {
      const source = readFileSync(path.join(ROOT_DIR, file), 'utf8');
      for (const match of source.matchAll(
        /['"](B-[A-Z0-9-]+|R-[A-Z0-9-]+|R[123])['"]/g,
      )) {
        expect(ruleHelp).toHaveProperty(match[1]);
        expect(formatRuleHelp([match[1]])).toContain('修复：');
      }
    }
  });

  it('explains known rules and rejects unknown rules', () => {
    const result = spawnSync(
      'bash',
      [CHECK_SCRIPT, '--', '--explain', 'B-R1'],
      {
        encoding: 'utf8',
      },
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('移除路由中的 Prisma import');
    const unknown = spawnSync('bash', [CHECK_SCRIPT, '--explain', 'UNKNOWN'], {
      encoding: 'utf8',
    });
    expect(unknown.status).toBe(2);
  });

  it('reports the full permission checker error and remains blocked', () => {
    const rootDir = createFixture({
      'apps/web-antd/src/example.vue':
        "const permission = 'QMS:Missing:Write';",
    });
    try {
      const result = runCheck(rootDir);
      expect(result.status).toBe(1);
      expect(result.output).toContain('[B-AUTH2]');
      expect(result.output).toContain('QMS:Missing:Write');
      expect(result.output).toContain('规则 B-AUTH2 原因：');
    } finally {
      rmSync(rootDir, { force: true, recursive: true });
    }
  });

  it('preserves child checker errors and never reports a pass on execution failure', () => {
    const rootDir = createFixture({
      'apps/backend/modules/example/example.service.ts':
        'export const example = 1;',
    });
    try {
      writeFixtureFile(
        rootDir,
        'checker-crash.cjs',
        "process.stdout.write('fixture checker stdout\n'); throw new Error('fixture checker stderr');".replace(
          'stdout\n',
          String.raw`stdout\n`,
        ),
      );
      const result = runCheck(rootDir, {
        NODE_OPTIONS: `--require=${path.join(rootDir, 'checker-crash.cjs')}`,
      });
      expect(result.status).toBe(2);
      expect(result.output).toContain('检查器异常：');
      expect(result.output).toContain('fixture checker stdout');
      expect(result.output).toContain('fixture checker stderr');
      expect(result.output).not.toContain('QMS architecture check passed.');
    } finally {
      rmSync(rootDir, { force: true, recursive: true });
    }
  });
});
