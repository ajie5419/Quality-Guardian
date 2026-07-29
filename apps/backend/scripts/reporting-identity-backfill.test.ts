import { readFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '~/utils/prisma';

import {
  backfillQualityLossSourceDepartmentIdentities,
  backfillReportingProjectIdentities,
  buildIdentityContext,
  resolveCanonicalIdentity,
} from './reporting-identity-backfill';

const prismaMocks = vi.hoisted(() => {
  const emptyDelegate = () => ({
    findMany: vi.fn().mockResolvedValue([]),
    updateMany: vi.fn(),
  });
  return {
    after_sales: emptyDelegate(),
    departments: { findMany: vi.fn() },
    inspections: emptyDelegate(),
    master_projects: { findMany: vi.fn() },
    quality_losses: emptyDelegate(),
    quality_records: emptyDelegate(),
    unresolved_master_data_refs: {
      updateMany: vi.fn(),
      upsert: vi.fn(),
    },
    vehicle_commissioning_issues: emptyDelegate(),
    work_orders: emptyDelegate(),
  };
});

vi.mock('~/utils/prisma', () => ({
  default: prismaMocks,
}));

describe('reporting identity backfill', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const delegate of [
      prisma.after_sales,
      prisma.inspections,
      prisma.quality_losses,
      prisma.quality_records,
      prisma.vehicle_commissioning_issues,
      prisma.work_orders,
    ]) {
      vi.mocked(delegate.findMany).mockResolvedValue([]);
      vi.mocked(delegate.updateMany).mockResolvedValue({ count: 0 });
    }
    vi.mocked(prisma.unresolved_master_data_refs.updateMany).mockResolvedValue({
      count: 0,
    });
    vi.mocked(prisma.unresolved_master_data_refs.upsert).mockResolvedValue(
      {} as never,
    );
  });

  it('resolves exact IDs and unique names but rejects ambiguous names', () => {
    const context = buildIdentityContext([
      { id: 'dept-1', name: 'Quality' },
      { id: 'dept-2', name: 'Production' },
      { id: 'dept-3', name: 'Production' },
    ]);

    expect(resolveCanonicalIdentity('dept-1', context)).toMatchObject({
      identity: { id: 'dept-1', name: 'Quality' },
      matchedBy: 'id',
      status: 'resolved',
    });
    expect(resolveCanonicalIdentity('Quality', context)).toMatchObject({
      identity: { id: 'dept-1', name: 'Quality' },
      matchedBy: 'name',
      status: 'resolved',
    });
    expect(resolveCanonicalIdentity('Production', context)).toEqual({
      candidateIds: ['dept-2', 'dept-3'],
      reason: 'AMBIGUOUS_CANONICAL_NAME',
      status: 'unresolved',
    });
  });

  it('backfills quality record project IDs without changing name snapshots', async () => {
    vi.mocked(prisma.master_projects.findMany).mockResolvedValue([
      { id: 'project-1', name: 'Project Alpha' },
    ] as never);
    vi.mocked(prisma.quality_records.findMany).mockResolvedValue([
      { id: 'issue-1', projectName: 'Project Alpha' },
    ] as never);
    vi.mocked(prisma.quality_records.updateMany).mockResolvedValue({
      count: 1,
    });

    await expect(
      backfillReportingProjectIdentities({ batchSize: 10 }),
    ).resolves.toEqual({
      concurrentChanges: 0,
      processed: 1,
      unresolved: 0,
      updated: 1,
    });
    expect(prisma.quality_records.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'issue-1',
        isDeleted: false,
        projectId: null,
        projectName: 'Project Alpha',
      },
      data: { projectId: 'project-1' },
    });
  });

  it('uses a non-empty filter for required after-sales project names', async () => {
    vi.mocked(prisma.master_projects.findMany).mockResolvedValue([]);

    await backfillReportingProjectIdentities({ batchSize: 10 });

    expect(prisma.after_sales.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          isDeleted: false,
          projectId: null,
          projectName: { not: '' },
        },
      }),
    );
  });

  it('repairs a department ID stored in the legacy name column', async () => {
    vi.mocked(prisma.departments.findMany).mockResolvedValue([
      { id: 'dept-1', name: 'Quality' },
    ] as never);
    vi.mocked(prisma.after_sales.findMany).mockResolvedValue([
      { id: 'after-sales-1', respDept: 'dept-1' },
    ] as never);
    vi.mocked(prisma.after_sales.updateMany).mockResolvedValue({ count: 1 });

    await expect(
      backfillQualityLossSourceDepartmentIdentities({ batchSize: 10 }),
    ).resolves.toEqual({
      concurrentChanges: 0,
      processed: 1,
      unresolved: 0,
      updated: 1,
    });
    expect(prisma.after_sales.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'after-sales-1',
        isDeleted: false,
        respDept: 'dept-1',
        respDeptId: null,
      },
      data: { respDept: 'Quality', respDeptId: 'dept-1' },
    });
  });

  it('uses a non-empty filter for required quality-record department names', async () => {
    vi.mocked(prisma.departments.findMany).mockResolvedValue([]);

    await backfillQualityLossSourceDepartmentIdentities({ batchSize: 10 });

    expect(prisma.quality_records.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          isDeleted: false,
          responsibleDepartment: { not: '' },
          responsibleDepartmentId: null,
        },
      }),
    );
  });

  it('audits duplicate department names without guessing', async () => {
    vi.mocked(prisma.departments.findMany).mockResolvedValue([
      { id: 'dept-1', name: 'Production' },
      { id: 'dept-2', name: 'Production' },
    ] as never);
    vi.mocked(prisma.after_sales.findMany).mockResolvedValue([
      { id: 'after-sales-1', respDept: 'Production' },
    ] as never);

    await expect(
      backfillQualityLossSourceDepartmentIdentities({ batchSize: 10 }),
    ).resolves.toMatchObject({ unresolved: 1, updated: 0 });
    expect(prisma.after_sales.updateMany).not.toHaveBeenCalled();
    expect(prisma.unresolved_master_data_refs.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          entityId: 'after-sales-1',
          entityType: 'after_sales',
          evidence: { candidateIds: ['dept-1', 'dept-2'] },
          fieldName: 'respDeptId',
          reason: 'AMBIGUOUS_CANONICAL_NAME',
        }),
      }),
    );
  });

  it('backfills source tables before the detached quality loss index rebuild', () => {
    const cwd = process.cwd();
    const backendRoot =
      basename(cwd) === 'backend' && basename(dirname(cwd)) === 'apps'
        ? cwd
        : resolve(cwd, 'apps/backend');
    const repositoryRoot = resolve(backendRoot, '../..');
    const wrapper = readFileSync(
      resolve(backendRoot, 'scripts/backfill-identity-relations.ts'),
      'utf8',
    );
    const maintenance = readFileSync(
      resolve(backendRoot, 'scripts/run-release-maintenance.sh'),
      'utf8',
    );
    const deploy = readFileSync(
      resolve(repositoryRoot, '.github/workflows/deploy.yml'),
      'utf8',
    );

    expect(wrapper).toContain(
      "bootstrapCanonicalFromTargetNames(\n      'projectName'",
    );
    expect(wrapper).toContain('backfillReportingProjectIdentities()');
    expect(wrapper).toContain(
      'backfillQualityLossSourceDepartmentIdentities()',
    );
    expect(maintenance).toContain('scripts/backfill-identity-relations.ts');
    expect(deploy).toContain('scripts/backfill-quality-loss-index.ts');
    expect(wrapper).not.toContain('quality_loss_index');
  });
});
