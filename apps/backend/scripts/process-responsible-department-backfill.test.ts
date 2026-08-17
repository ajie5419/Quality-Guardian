import type { ProcessDepartmentAssignment } from './process-responsible-department-backfill';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { runProcessResponsibleDepartmentBackfill } from './process-responsible-department-backfill';

const { departmentsFindMany, processesFindFirst, processesUpdate } = vi.hoisted(
  () => ({
    departmentsFindMany: vi.fn(),
    processesFindFirst: vi.fn(),
    processesUpdate: vi.fn(),
  }),
);

vi.mock('~/utils/prisma', () => ({
  default: {
    departments: { findMany: departmentsFindMany },
    processes: {
      findFirst: processesFindFirst,
      update: processesUpdate,
    },
  },
}));

const DEPT_ROWS = [
  { id: 'dept-root', name: '科技公司', parentId: '0' },
  { id: 'dept-sobu', name: '制造 SOBU', parentId: 'dept-root' },
  { id: 'dept-purchase', name: '采购部', parentId: 'dept-sobu' },
  { id: 'dept-fulfil', name: '生产履约部', parentId: '0' },
];

function txClient() {
  return {
    departments: { findMany: departmentsFindMany },
    processes: {
      findFirst: processesFindFirst,
      update: processesUpdate,
    },
  } as never;
}

const ASSIGNMENTS: ProcessDepartmentAssignment[] = [
  {
    departmentPath: ['科技公司', '制造 SOBU', '采购部'],
    processName: '外购件',
    responsibilityType: 'SUPPLIER',
  },
];

describe('process responsible department backfill', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    departmentsFindMany.mockResolvedValue(DEPT_ROWS);
  });

  it('resolves the department by path and updates the process in apply mode', async () => {
    processesFindFirst.mockResolvedValue({
      id: 'process-1',
      name: '外购件',
      responsibleDepartmentId: null,
      supplierSource: 'Supplier',
    });
    processesUpdate.mockResolvedValue({});

    const summary = await runProcessResponsibleDepartmentBackfill({
      assignments: ASSIGNMENTS,
      mode: 'apply',
      client: txClient(),
    });

    expect(summary.updated).toBe(1);
    expect(summary.unresolved).toBe(0);
    expect(processesUpdate).toHaveBeenCalledWith({
      data: { responsibleDepartmentId: 'dept-purchase' },
      where: { id: 'process-1' },
    });
  });

  it('does not write anything in dry-run mode', async () => {
    processesFindFirst.mockResolvedValue({
      id: 'process-1',
      name: '外购件',
      responsibleDepartmentId: null,
      supplierSource: 'Supplier',
    });

    const summary = await runProcessResponsibleDepartmentBackfill({
      assignments: ASSIGNMENTS,
      mode: 'dry-run',
      client: txClient(),
    });

    expect(summary.planned).toBe(1);
    expect(processesUpdate).not.toHaveBeenCalled();
  });

  it('skips processes that already carry the target department', async () => {
    processesFindFirst.mockResolvedValue({
      id: 'process-1',
      name: '外购件',
      responsibleDepartmentId: 'dept-purchase',
      supplierSource: 'Supplier',
    });

    const summary = await runProcessResponsibleDepartmentBackfill({
      assignments: ASSIGNMENTS,
      mode: 'apply',
      client: txClient(),
    });

    expect(summary.skipped).toBe(1);
    expect(processesUpdate).not.toHaveBeenCalled();
  });

  it('reports missing processes as unresolved', async () => {
    processesFindFirst.mockResolvedValue(null);

    const summary = await runProcessResponsibleDepartmentBackfill({
      assignments: ASSIGNMENTS,
      mode: 'apply',
      client: txClient(),
    });

    expect(summary.unresolved).toBe(1);
    expect(summary.entries[0]).toMatchObject({
      action: 'unresolved',
      reason: 'PROCESS_NOT_FOUND',
    });
    expect(processesUpdate).not.toHaveBeenCalled();
  });

  it('reports an ambiguous department path with candidates', async () => {
    processesFindFirst.mockResolvedValue({
      id: 'process-1',
      name: '外购件',
      responsibleDepartmentId: null,
      supplierSource: 'Supplier',
    });
    departmentsFindMany.mockResolvedValue([
      { id: 'dept-a', name: '采购部', parentId: 'dept-sobu-1' },
      { id: 'dept-b', name: '采购部', parentId: 'dept-sobu-2' },
      { id: 'dept-sobu-1', name: '制造 SOBU', parentId: 'dept-root' },
      { id: 'dept-sobu-2', name: '制造 SOBU', parentId: 'dept-root' },
      { id: 'dept-root', name: '科技公司', parentId: '0' },
    ]);

    const summary = await runProcessResponsibleDepartmentBackfill({
      assignments: [
        {
          departmentPath: ['科技公司', '制造 SOBU', '采购部'],
          processName: '外购件',
          responsibilityType: 'SUPPLIER',
        },
      ],
      mode: 'apply',
      client: txClient(),
    });

    expect(summary.unresolved).toBe(1);
    expect(summary.entries[0]).toMatchObject({
      action: 'unresolved',
      reason: 'AMBIGUOUS_DEPARTMENT_PATH',
    });
    expect(processesUpdate).not.toHaveBeenCalled();
  });

  it('flags a supplier-source mismatch as a warning but still applies', async () => {
    processesFindFirst.mockResolvedValue({
      id: 'process-1',
      name: '辅材',
      responsibleDepartmentId: null,
      supplierSource: 'Supplier',
    });

    const summary = await runProcessResponsibleDepartmentBackfill({
      assignments: [
        {
          departmentPath: ['生产履约部'],
          processName: '辅材',
          responsibilityType: 'OUTSOURCING_UNIT',
        },
      ],
      mode: 'apply',
      client: txClient(),
    });

    expect(summary.updated).toBe(1);
    expect(summary.entries[0]).toMatchObject({
      action: 'updated',
      supplierSourceMismatch: true,
    });
    expect(processesUpdate).toHaveBeenCalledWith({
      data: { responsibleDepartmentId: 'dept-fulfil' },
      where: { id: 'process-1' },
    });
  });
});
