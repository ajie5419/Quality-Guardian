import { readFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '~/utils/prisma';

import {
  assertInspectionRequestResponsibilityBackfillSucceeded,
  backfillInspectionRequestResponsibilities,
  parseInspectionRequestResponsibilityBackfillOptions,
  resolveInspectionRequestResponsibilityBackfill,
} from './inspection-request-responsibility-backfill';

const { resolveInspectionRequestIssueResponsibilities } = vi.hoisted(() => ({
  resolveInspectionRequestIssueResponsibilities: vi.fn(),
}));

vi.mock(
  '~/modules/inspection/inspection-request-responsibility.service',
  () => ({
    resolveInspectionRequestIssueResponsibilities,
  }),
);

vi.mock('~/utils/prisma', () => ({
  default: {
    departments: { findMany: vi.fn() },
    qms_inspection_requests: { findMany: vi.fn(), updateMany: vi.fn() },
    suppliers: { findMany: vi.fn() },
    unresolved_master_data_refs: { updateMany: vi.fn(), upsert: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock('~/utils/logger', () => ({
  createModuleLogger: vi.fn().mockReturnValue({ info: vi.fn() }),
}));

const applyOptions = { batchSize: 100, mode: 'apply' as const };
const internalDepartment = { id: 'dept-assembly', name: 'Assembly' };
const purchasingDepartment = { id: 'dept-purchasing', name: 'Purchasing' };
const productionDepartment = { id: 'dept-production', name: 'Production OBU' };
const supplierA = { id: 'supplier-a', name: 'Supplier A' };
type Resolver = {
  responsibilityType: 'INTERNAL_DEPARTMENT' | 'OUTSOURCING_UNIT' | 'SUPPLIER';
  responsibleDepartment: string;
  responsibleDepartmentId: null | string;
  supplierId: null | string;
};

function request(overrides: Record<string, unknown> = {}) {
  return {
    category: 'PROCESS',
    id: 'request-1',
    processName: 'Assembly',
    requestNo: 'IR-1',
    responsibilityType: null,
    responsibleDepartment: null,
    responsibleDepartmentId: null,
    supplierId: null,
    team: 'Assembly',
    teamId: 'team-assembly',
    ...overrides,
  };
}

function resolver(overrides: Partial<Resolver> = {}): Resolver {
  return {
    responsibilityType: 'INTERNAL_DEPARTMENT',
    responsibleDepartment: 'Assembly',
    responsibleDepartmentId: internalDepartment.id,
    supplierId: null,
    ...overrides,
  };
}

function mockScan(rows: unknown[]) {
  vi.mocked(prisma.qms_inspection_requests.findMany)
    .mockResolvedValueOnce(rows as never)
    .mockResolvedValueOnce([]);
}

function backendRoot() {
  const cwd = process.cwd();
  return basename(cwd) === 'backend' && basename(dirname(cwd)) === 'apps'
    ? cwd
    : resolve(cwd, 'apps/backend');
}

describe('inspection request responsibility backfill', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(prisma.departments.findMany).mockResolvedValue([
      internalDepartment,
      purchasingDepartment,
      productionDepartment,
    ] as never);
    vi.mocked(prisma.suppliers.findMany).mockResolvedValue([
      supplierA,
    ] as never);
    vi.mocked(prisma.qms_inspection_requests.updateMany).mockResolvedValue({
      count: 1,
    });
    vi.mocked(prisma.unresolved_master_data_refs.updateMany).mockResolvedValue({
      count: 0,
    });
    vi.mocked(prisma.unresolved_master_data_refs.upsert).mockResolvedValue(
      {} as never,
    );
    vi.mocked(prisma.$transaction).mockImplementation((async (callback: any) =>
      callback(prisma)) as any);
  });

  it('parses bounded dry-run/apply options', () => {
    expect(parseInspectionRequestResponsibilityBackfillOptions([], {})).toEqual(
      { batchSize: 200, mode: 'dry-run' },
    );
    expect(
      parseInspectionRequestResponsibilityBackfillOptions(
        ['--apply', '--batch-size=5000', '--max-batches=2'],
        {},
      ),
    ).toEqual({ batchSize: 1000, maxBatches: 2, mode: 'apply' });
    expect(() =>
      parseInspectionRequestResponsibilityBackfillOptions(
        ['--batch-size=0'],
        {},
      ),
    ).toThrow('--batch-size must be a positive integer');
  });

  it('keeps a complete new internal responsibility independent of TEAM supplier links', async () => {
    mockScan([
      request({
        responsibilityType: 'INTERNAL_DEPARTMENT',
        responsibleDepartment: 'Old assembly snapshot',
        responsibleDepartmentId: internalDepartment.id,
      }),
    ]);
    resolveInspectionRequestIssueResponsibilities.mockResolvedValue([
      resolver(),
    ]);

    await expect(
      backfillInspectionRequestResponsibilities(applyOptions),
    ).resolves.toMatchObject({ plannedOrUpdated: 1, unresolved: 0 });
    expect(prisma.qms_inspection_requests.updateMany).toHaveBeenCalledWith({
      data: {
        responsibilityType: 'INTERNAL_DEPARTMENT',
        responsibleDepartment: 'Assembly',
        responsibleDepartmentId: 'dept-assembly',
        supplierId: null,
      },
      where: {
        id: 'request-1',
        isDeleted: false,
        responsibilityType: 'INTERNAL_DEPARTMENT',
        responsibleDepartment: 'Old assembly snapshot',
        responsibleDepartmentId: 'dept-assembly',
        supplierId: null,
      },
    });
  });

  it('keeps a complete new external responsibility independent of TEAM supplier links', async () => {
    mockScan([
      request({
        responsibilityType: 'OUTSOURCING_UNIT',
        responsibleDepartment: 'Old production snapshot',
        responsibleDepartmentId: productionDepartment.id,
        supplierId: supplierA.id,
      }),
    ]);
    resolveInspectionRequestIssueResponsibilities.mockResolvedValue([]);

    await backfillInspectionRequestResponsibilities(applyOptions);

    expect(prisma.qms_inspection_requests.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          responsibilityType: 'OUTSOURCING_UNIT',
          responsibleDepartment: 'Production OBU',
          responsibleDepartmentId: 'dept-production',
          supplierId: 'supplier-a',
        },
      }),
    );
  });

  it('uses deterministic legacy resolver evidence to complete an external request', async () => {
    mockScan([
      request({ processName: 'Outsourcing welding', teamId: 'team-old' }),
    ]);
    resolveInspectionRequestIssueResponsibilities.mockResolvedValue([
      resolver({
        responsibilityType: 'OUTSOURCING_UNIT',
        responsibleDepartment: 'Production OBU',
        responsibleDepartmentId: productionDepartment.id,
        supplierId: supplierA.id,
      }),
    ]);

    await backfillInspectionRequestResponsibilities(applyOptions);

    expect(prisma.qms_inspection_requests.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          responsibilityType: 'OUTSOURCING_UNIT',
          responsibleDepartment: 'Production OBU',
          responsibleDepartmentId: 'dept-production',
          supplierId: 'supplier-a',
        },
      }),
    );
  });

  it('keeps conflicting persisted and resolver responsibility evidence unchanged', async () => {
    mockScan([request({ responsibilityType: 'INTERNAL_DEPARTMENT' })]);
    resolveInspectionRequestIssueResponsibilities.mockResolvedValue([
      resolver({
        responsibilityType: 'OUTSOURCING_UNIT',
        responsibleDepartmentId: purchasingDepartment.id,
        supplierId: supplierA.id,
      }),
    ]);

    const result =
      await backfillInspectionRequestResponsibilities(applyOptions);

    expect(result).toMatchObject({ conflicts: 1, unresolved: 1 });
    expect(prisma.qms_inspection_requests.updateMany).not.toHaveBeenCalled();
    expect(prisma.unresolved_master_data_refs.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          entityId: 'request-1',
          reason: 'CONFLICTING_RESPONSIBILITY_TYPE',
        }),
        update: expect.not.objectContaining({ status: expect.anything() }),
      }),
    );
    expect(() =>
      assertInspectionRequestResponsibilityBackfillSucceeded(result),
    ).toThrow('conflicts=1');
  });

  it('keeps missing canonical evidence auditable without blocking nullable legacy compatibility', async () => {
    mockScan([request()]);
    resolveInspectionRequestIssueResponsibilities.mockResolvedValue([
      resolver({ responsibleDepartmentId: null }),
    ]);

    const result =
      await backfillInspectionRequestResponsibilities(applyOptions);

    expect(result).toMatchObject({ missingEvidence: 1, unresolved: 1 });
    expect(prisma.qms_inspection_requests.updateMany).not.toHaveBeenCalled();
    expect(() =>
      assertInspectionRequestResponsibilityBackfillSucceeded(result),
    ).not.toThrow();
  });

  it('does not write records or audits during dry-run', async () => {
    mockScan([request()]);
    resolveInspectionRequestIssueResponsibilities.mockResolvedValue([
      resolver(),
    ]);

    await expect(
      backfillInspectionRequestResponsibilities({
        batchSize: 100,
        mode: 'dry-run',
      }),
    ).resolves.toMatchObject({ plannedOrUpdated: 1, unresolved: 0 });
    expect(prisma.qms_inspection_requests.updateMany).not.toHaveBeenCalled();
    expect(prisma.unresolved_master_data_refs.upsert).not.toHaveBeenCalled();
    expect(
      prisma.unresolved_master_data_refs.updateMany,
    ).not.toHaveBeenCalled();
  });

  it('reports a lost compare-and-set update without resolving an audit', async () => {
    vi.mocked(prisma.qms_inspection_requests.updateMany).mockResolvedValue({
      count: 0,
    });
    mockScan([request()]);
    resolveInspectionRequestIssueResponsibilities.mockResolvedValue([
      resolver(),
    ]);

    const result =
      await backfillInspectionRequestResponsibilities(applyOptions);

    expect(result).toMatchObject({ concurrentChanges: 1, plannedOrUpdated: 0 });
    expect(
      prisma.unresolved_master_data_refs.updateMany,
    ).not.toHaveBeenCalled();
    expect(() =>
      assertInspectionRequestResponsibilityBackfillSucceeded(result),
    ).toThrow('concurrentChanges=1');
  });

  it('processes a complete keyset scan across multiple batches', async () => {
    vi.mocked(prisma.qms_inspection_requests.findMany)
      .mockResolvedValueOnce([
        request({ id: 'request-1' }),
        request({ id: 'request-2' }),
        request({ id: 'request-3' }),
      ] as never)
      .mockResolvedValueOnce([request({ id: 'request-3' })] as never);
    resolveInspectionRequestIssueResponsibilities
      .mockResolvedValueOnce([resolver(), resolver()])
      .mockResolvedValueOnce([resolver()]);

    await expect(
      backfillInspectionRequestResponsibilities({
        batchSize: 2,
        maxBatches: 2,
        mode: 'dry-run',
      }),
    ).resolves.toMatchObject({
      batches: 2,
      hasMore: false,
      incomplete: false,
      plannedOrUpdated: 3,
      processed: 3,
    });
  });

  it('marks an intentionally capped scan incomplete and blocks release maintenance', async () => {
    vi.mocked(prisma.qms_inspection_requests.findMany).mockResolvedValueOnce([
      request({ id: 'request-1' }),
      request({ id: 'request-2' }),
      request({ id: 'request-3' }),
    ] as never);
    resolveInspectionRequestIssueResponsibilities.mockResolvedValue([
      resolver(),
      resolver(),
    ]);

    const result = await backfillInspectionRequestResponsibilities({
      batchSize: 2,
      maxBatches: 1,
      mode: 'dry-run',
    });

    expect(result).toMatchObject({
      batches: 1,
      hasMore: true,
      incomplete: true,
      plannedOrUpdated: 2,
      processed: 2,
    });
    expect(() =>
      assertInspectionRequestResponsibilityBackfillSucceeded(result),
    ).toThrow('incomplete=1');
  });

  it('skips an already canonical responsibility idempotently', () => {
    expect(
      resolveInspectionRequestResponsibilityBackfill({
        activeDepartmentsById: new Map([
          [internalDepartment.id, internalDepartment],
        ]),
        activeSuppliersById: new Map(),
        resolver: resolver(),
        row: request({
          responsibilityType: 'INTERNAL_DEPARTMENT',
          responsibleDepartment: internalDepartment.name,
          responsibleDepartmentId: internalDepartment.id,
        }),
      }),
    ).toEqual({ action: 'skip' });
  });

  it('does not rerun historical responsibility backfills in every release', () => {
    const maintenanceScript = readFileSync(
      resolve(backendRoot(), 'scripts/run-release-maintenance.sh'),
      'utf8',
    );
    expect(maintenanceScript).not.toContain(
      'scripts/backfill-inspection-request-categories.ts',
    );
    expect(maintenanceScript).not.toContain(
      'scripts/backfill-inspection-request-responsibilities.ts',
    );
    expect(maintenanceScript).not.toContain(
      'scripts/backfill-inspection-issue-responsibilities.ts',
    );
  });

  it('does not run the one-time historical identity sidecar bootstrap', () => {
    const maintenanceScript = readFileSync(
      resolve(backendRoot(), 'scripts/run-release-maintenance.sh'),
      'utf8',
    );

    expect(maintenanceScript).not.toContain(
      'scripts/historical-identity-sidecar-bootstrap.ts',
    );
  });

  it('keeps supplier batch progress at debug while preserving one terminal summary', () => {
    const scriptDirectory = resolve(backendRoot(), 'scripts');
    const supplierScripts = [
      {
        file: 'backfill-inspection-supplier-identities.ts',
        summary: 'inspection supplier identity audit/backfill finished',
      },
      {
        file: 'backfill-after-sales-supplier-identities.ts',
        summary: 'after-sales supplier identity audit/backfill finished',
      },
      {
        file: 'backfill-quality-record-supplier-identities.ts',
        summary: 'supplier identity audit/backfill finished',
      },
    ];

    for (const { file, summary } of supplierScripts) {
      const source = readFileSync(resolve(scriptDirectory, file), 'utf8');
      expect(source).toMatch(/logger\.debug\([\s\S]*?batch finished/u);
      expect(source).toMatch(
        /logger\.info\([\s\S]*?(?:qualityRecordSummary|summary)/u,
      );
      expect(source).toContain(summary);
    }
  });

  it('emits responsibility terminal summaries only from CLI entrypoints', () => {
    const scriptDirectory = resolve(backendRoot(), 'scripts');
    const summaries = [
      {
        entrypoint: 'backfill-inspection-request-responsibilities.ts',
        service: 'inspection-request-responsibility-backfill.ts',
        text: 'inspection request responsibility backfill finished',
      },
      {
        entrypoint: 'backfill-inspection-issue-responsibilities.ts',
        service: 'inspection-issue-responsibility-backfill.ts',
        text: 'inspection issue responsibility backfill finished',
      },
      {
        entrypoint: 'remediate-inspection-issue-responsibilities.ts',
        service: 'inspection-issue-responsibility-remediation.ts',
        text: 'corrupted inspection issue responsibility remediation finished',
      },
    ];

    for (const { entrypoint, service, text } of summaries) {
      expect(
        readFileSync(resolve(scriptDirectory, entrypoint), 'utf8'),
      ).toContain(text);
      expect(
        readFileSync(resolve(scriptDirectory, service), 'utf8'),
      ).not.toContain(text);
    }
  });
});
