import type { Prisma } from '@prisma/client';

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildCloseLinkedIssueCreateResult } from '~/modules/inspection/inspection-request-close-issue.service';

const tx = {} as Prisma.TransactionClient;

const {
  mockBuildGovernedCanonicalWritePair,
  mockResolveCanonicalNameById,
  mockResolveSupplierById,
  mockResolveSupplierByTeamId,
  mockResolveCanonicalProcessName,
} = vi.hoisted(() => ({
  mockBuildGovernedCanonicalWritePair: vi.fn(),
  mockResolveCanonicalNameById: vi.fn(),
  mockResolveSupplierById: vi.fn(),
  mockResolveSupplierByTeamId: vi.fn(),
  mockResolveCanonicalProcessName: vi.fn(),
}));

vi.mock('~/utils/canonical-master-data', () => ({
  MasterDataGovernanceKernel: {
    resolveCanonicalNameById: mockResolveCanonicalNameById,
  },
}));

vi.mock('~/modules/supplier-identity', () => ({
  SupplierIdentityService: {
    resolveSupplierById: mockResolveSupplierById,
    resolveSupplierByTeamId: mockResolveSupplierByTeamId,
  },
}));

vi.mock('~/utils/governed-write', () => ({
  buildGovernedCanonicalWritePairForTable: mockBuildGovernedCanonicalWritePair,
  buildGovernedWriteFieldsForTable: vi
    .fn()
    .mockImplementation((_table, fields) => fields),
}));

vi.mock('~/utils/process-resolver', () => ({
  resolveCanonicalProcessName: mockResolveCanonicalProcessName,
}));

vi.mock('~/modules/inspection/inspection-issue', () => ({
  buildInspectionIssueCreateData: vi.fn().mockResolvedValue({
    partName: 'Bearing',
    status: 'OPEN',
  }),
  createInspectionIssueId: vi.fn().mockReturnValue('QC-001'),
  findInspectionForIssue: vi.fn().mockResolvedValue({
    id: 'i-1',
    work_order: { division: 'Vehicle OBU', divisionId: 'dept-vehicle' },
  }),
  getNextInspectionIssueSerialNumber: vi.fn().mockResolvedValue(1),
}));

vi.mock('~/modules/inspection/inspection-request', () => ({
  normalizeInspectionRequestText: vi.fn().mockImplementation((v) => v || ''),
}));

vi.mock('~/modules/inspection/inspection-request-close.schema', () => ({
  failCloseRequest: (_prefix: string, message: string) => {
    throw new Error(message);
  },
  parseCloseRequestNumber: (value: unknown, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  },
}));

describe('buildCloseLinkedIssueCreateResult', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const departmentNames: Record<string, string> = {
      'dept-assembly': 'Final Assembly Team',
      'dept-production': '生产 OBU',
      'dept-purchasing': '采购部',
    };
    mockResolveCanonicalNameById.mockImplementation(
      ({ canonicalId }: { canonicalId: string }) =>
        Promise.resolve(departmentNames[canonicalId] || null),
    );
    mockBuildGovernedCanonicalWritePair.mockImplementation(
      (_table, fields: Record<string, unknown>) => {
        const id = String(fields.responsibleDepartmentId || '');
        return Promise.resolve({
          responsibleDepartment: departmentNames[id],
          responsibleDepartmentId: departmentNames[id] ? id : undefined,
        });
      },
    );
    mockResolveSupplierById.mockImplementation((id: string) =>
      Promise.resolve({
        id,
        name: id === 'supplier-incoming' ? 'Supplier A' : 'Outsourcing Plant A',
      }),
    );
    mockResolveSupplierByTeamId.mockResolvedValue(null);
    mockResolveCanonicalProcessName.mockReturnValue('Process A');
  });

  it('should return auditVariables and createData', async () => {
    const result = await buildCloseLinkedIssueCreateResult({
      body: { unqualifiedQuantity: 3 },
      inspectionId: 'i-1',
      linkedIssue: {
        defectType: 'Welding defect',
        ncNumber: 'NC-2026-001',
        partName: 'Bearing',
        quantity: 3,
        responsibilityType: 'INTERNAL_DEPARTMENT',
        responsibleDepartment: 'stale client snapshot',
        responsibleDepartmentId: 'dept-assembly',
        severity: 'Major',
        status: 'OPEN',
      },
      request: {
        componentName: 'Comp A',
        partName: 'Bearing',
        process: { name: 'Welding' },
        processName: 'Welding',
        reporter: 'Reporter A',
        workOrderNumber: 'WO-1',
      },
      tx,
      userinfo: { id: 'user-1', username: 'admin' } as any,
    });

    expect(result.auditVariables).toBeDefined();
    expect(result.auditVariables.nonConformanceNumber).toBe('NC-2026-001');
    expect(result.createData).toEqual(
      expect.objectContaining({ responsibleDepartmentId: 'dept-assembly' }),
    );
    const { buildInspectionIssueCreateData } = await import(
      '~/modules/inspection/inspection-issue'
    );
    const { findInspectionForIssue, getNextInspectionIssueSerialNumber } =
      await import('~/modules/inspection/inspection-issue');
    expect(findInspectionForIssue).toHaveBeenCalledWith('i-1', tx);
    expect(getNextInspectionIssueSerialNumber).toHaveBeenCalledWith(tx);
    expect(buildInspectionIssueCreateData).toHaveBeenCalledWith(
      expect.objectContaining({
        division: 'Vehicle OBU',
        divisionId: 'dept-vehicle',
        ncNumber: 'NC-2026-001',
      }),
      expect.objectContaining({
        createdBy: 'user-1',
        inspection: expect.objectContaining({ id: 'i-1' }),
      }),
    );
  });

  it('should use defaults for missing fields', async () => {
    const { buildInspectionIssueCreateData } = await import(
      '~/modules/inspection/inspection-issue'
    );

    await buildCloseLinkedIssueCreateResult({
      body: { unqualifiedQuantity: 1 },
      inspectionId: 'i-1',
      linkedIssue: {
        responsibilityType: 'INTERNAL_DEPARTMENT',
        responsibleDepartment: 'outdated name',
        responsibleDepartmentId: 'dept-assembly',
      },
      request: {
        componentName: null,
        partName: 'Part',
        process: null,
        processName: 'Process',
        reporter: 'Reporter',
        team: 'Final Assembly Team',
        workOrderNumber: 'WO-1',
      },
      tx,
      userinfo: { id: 'user-1', username: 'admin' } as any,
    });

    expect(buildInspectionIssueCreateData).toHaveBeenCalledWith(
      expect.objectContaining({
        ncNumber: '',
        responsibleDepartment: 'Final Assembly Team',
        severity: 'Minor',
        sourceType: 'INSPECTION_REQUEST',
        status: 'OPEN',
      }),
      expect.any(Object),
    );
  });

  it('does not auto-fill nonconformance number when linked issue has no number', async () => {
    const { buildInspectionIssueCreateData } = await import(
      '~/modules/inspection/inspection-issue'
    );

    const result = await buildCloseLinkedIssueCreateResult({
      body: { unqualifiedQuantity: 1 },
      inspectionId: 'i-1',
      linkedIssue: {
        responsibilityType: 'INTERNAL_DEPARTMENT',
        responsibleDepartment: 'outdated name',
        responsibleDepartmentId: 'dept-assembly',
      },
      request: {
        componentName: null,
        partName: 'Part',
        process: null,
        processName: 'Process',
        reporter: 'Reporter',
        team: 'Final Assembly Team',
        workOrderNumber: 'WO-1',
      },
      tx,
      userinfo: { id: 'user-1', username: 'admin' } as any,
    });

    expect(result.auditVariables.nonConformanceNumber).toBe('');
    expect(buildInspectionIssueCreateData).toHaveBeenLastCalledWith(
      expect.objectContaining({
        ncNumber: '',
      }),
      expect.any(Object),
    );
  });

  it('uses incoming supplier as supplierName and purchasing as responsible department', async () => {
    mockResolveCanonicalProcessName.mockReturnValue('进货检验');
    const { buildInspectionIssueCreateData } = await import(
      '~/modules/inspection/inspection-issue'
    );

    await buildCloseLinkedIssueCreateResult({
      body: { unqualifiedQuantity: 1 },
      inspectionId: 'i-1',
      linkedIssue: {
        responsibilityType: 'SUPPLIER',
        responsibleDepartment: 'outdated department',
        responsibleDepartmentId: 'dept-purchasing',
        supplierId: 'supplier-incoming',
      },
      request: {
        componentName: null,
        partName: 'Part',
        process: null,
        processName: '进货检验',
        reporter: 'Reporter',
        supplierId: 'supplier-incoming',
        team: 'Supplier A',
        workOrderNumber: 'WO-1',
      },
      tx,
      userinfo: { id: 'user-1', username: 'admin' } as any,
    });

    expect(buildInspectionIssueCreateData).toHaveBeenLastCalledWith(
      expect.objectContaining({
        responsibleDepartment: '采购部',
        responsibleDepartmentId: 'dept-purchasing',
        supplierId: 'supplier-incoming',
        supplierName: 'Supplier A',
      }),
      expect.any(Object),
    );
  });

  it('uses outsourcing unit as supplierName and production OBU as responsible department', async () => {
    mockResolveCanonicalProcessName.mockReturnValue('外协机加');
    const { buildInspectionIssueCreateData } = await import(
      '~/modules/inspection/inspection-issue'
    );

    await buildCloseLinkedIssueCreateResult({
      body: { unqualifiedQuantity: 1 },
      inspectionId: 'i-1',
      linkedIssue: {
        responsibilityType: 'OUTSOURCING_UNIT',
        responsibleDepartment: 'outdated department',
        responsibleDepartmentId: 'dept-production',
        supplierId: 'supplier-outsourcing',
      },
      request: {
        componentName: null,
        partName: 'Part',
        process: null,
        processName: '外协机加',
        reporter: 'Reporter',
        team: 'Outsourcing Plant A',
        workOrderNumber: 'WO-1',
      },
      tx,
      userinfo: { id: 'user-1', username: 'admin' } as any,
    });

    expect(buildInspectionIssueCreateData).toHaveBeenLastCalledWith(
      expect.objectContaining({
        responsibleDepartment: '生产 OBU',
        responsibleDepartmentId: 'dept-production',
        supplierId: 'supplier-outsourcing',
        supplierName: 'Outsourcing Plant A',
      }),
      expect.any(Object),
    );
  });

  it('uses the TEAM identity mapping when process name is internal', async () => {
    mockResolveCanonicalProcessName.mockReturnValue('Welding');
    mockResolveSupplierByTeamId.mockResolvedValue({
      id: 'supplier-1',
      name: 'Outsourcing Plant A',
    });
    const { buildInspectionIssueCreateData } = await import(
      '~/modules/inspection/inspection-issue'
    );

    await buildCloseLinkedIssueCreateResult({
      body: { unqualifiedQuantity: 1 },
      inspectionId: 'i-1',
      linkedIssue: {
        responsibilityType: 'OUTSOURCING_UNIT',
        responsibleDepartment: 'outdated department',
        responsibleDepartmentId: 'dept-production',
        supplierId: 'supplier-1',
      },
      request: {
        componentName: null,
        partName: 'Part',
        process: null,
        processName: 'Welding',
        reporter: 'Reporter',
        team: 'Outsourcing Plant A',
        teamId: 'team-1',
        workOrderNumber: 'WO-1',
      },
      tx,
      userinfo: { id: 'user-1', username: 'admin' } as any,
    });

    expect(mockResolveSupplierByTeamId).toHaveBeenCalledWith('team-1');
    expect(buildInspectionIssueCreateData).toHaveBeenLastCalledWith(
      expect.objectContaining({
        responsibleDepartment: '生产 OBU',
        supplierId: 'supplier-1',
        supplierName: 'Outsourcing Plant A',
      }),
      expect.any(Object),
    );
  });

  it('accepts an explicit outsourcing unit when an old request has no TEAM mapping', async () => {
    const { buildInspectionIssueCreateData } = await import(
      '~/modules/inspection/inspection-issue'
    );

    await buildCloseLinkedIssueCreateResult({
      body: { unqualifiedQuantity: 1 },
      inspectionId: 'i-1',
      linkedIssue: {
        responsibilityType: 'OUTSOURCING_UNIT',
        responsibleDepartment: '生产 OBU',
        responsibleDepartmentId: 'dept-production',
        supplierId: 'supplier-outsourcing',
      },
      request: {
        partName: 'Part',
        processName: 'Welding',
        reporter: 'Reporter',
        teamId: 'legacy-team-without-link',
        workOrderNumber: 'WO-1',
      },
      tx,
      userinfo: { id: 'user-1', username: 'admin' } as any,
    });

    expect(buildInspectionIssueCreateData).toHaveBeenLastCalledWith(
      expect.objectContaining({
        responsibleDepartment: '生产 OBU',
        supplierId: 'supplier-outsourcing',
        supplierName: 'Outsourcing Plant A',
      }),
      expect.any(Object),
    );
  });

  it('rejects a supplier ID that conflicts with the inspection request', async () => {
    mockResolveCanonicalProcessName.mockReturnValue('进货检验');

    await expect(
      buildCloseLinkedIssueCreateResult({
        body: { unqualifiedQuantity: 1 },
        inspectionId: 'i-1',
        linkedIssue: {
          responsibilityType: 'SUPPLIER',
          responsibleDepartment: '采购部',
          responsibleDepartmentId: 'dept-purchasing',
          supplierId: 'supplier-other',
        },
        request: {
          partName: 'Part',
          processName: '进货检验',
          reporter: 'Reporter',
          supplierId: 'supplier-incoming',
          workOrderNumber: 'WO-1',
        },
        tx,
        userinfo: { id: 'user-1', username: 'admin' } as any,
      }),
    ).rejects.toThrow('供应商 ID 与报检任务的 canonical 责任单位不一致');
  });

  it('rejects an internal responsibility type for an external TEAM', async () => {
    mockResolveSupplierByTeamId.mockResolvedValue({
      id: 'supplier-1',
      name: 'Outsourcing Plant A',
    });

    await expect(
      buildCloseLinkedIssueCreateResult({
        body: { unqualifiedQuantity: 1 },
        inspectionId: 'i-1',
        linkedIssue: {
          responsibilityType: 'INTERNAL_DEPARTMENT',
          responsibleDepartment: 'Final Assembly Team',
          responsibleDepartmentId: 'dept-assembly',
        },
        request: {
          partName: 'Part',
          processName: 'Welding',
          reporter: 'Reporter',
          teamId: 'team-1',
          workOrderNumber: 'WO-1',
        },
        tx,
        userinfo: { id: 'user-1', username: 'admin' } as any,
      }),
    ).rejects.toThrow('责任类型与报检任务的 canonical 责任单位不一致');
  });

  it('accepts a legacy responsibleDepartment value only when it is a canonical ID', async () => {
    const { buildInspectionIssueCreateData } = await import(
      '~/modules/inspection/inspection-issue'
    );

    await buildCloseLinkedIssueCreateResult({
      body: { unqualifiedQuantity: 1 },
      inspectionId: 'i-1',
      linkedIssue: { responsibleDepartment: 'dept-assembly' },
      request: {
        partName: 'Part',
        processName: 'Welding',
        reporter: 'Reporter',
        workOrderNumber: 'WO-1',
      },
      tx,
      userinfo: { id: 'user-1', username: 'admin' } as any,
    });

    expect(buildInspectionIssueCreateData).toHaveBeenLastCalledWith(
      expect.objectContaining({
        responsibleDepartment: 'Final Assembly Team',
        responsibleDepartmentId: 'dept-assembly',
      }),
      expect.any(Object),
    );
  });

  it('does not treat a legacy company name as a responsible department', async () => {
    await expect(
      buildCloseLinkedIssueCreateResult({
        body: { unqualifiedQuantity: 1 },
        inspectionId: 'i-1',
        linkedIssue: { responsibleDepartment: 'Outsourcing Plant A' },
        request: {
          partName: 'Part',
          processName: 'Welding',
          reporter: 'Reporter',
          workOrderNumber: 'WO-1',
        },
        tx,
        userinfo: { id: 'user-1', username: 'admin' } as any,
      }),
    ).rejects.toThrow('不合格项责任部门 ID 无效');
  });

  it('uses the canonical request process for legacy responsibility inference', async () => {
    mockResolveCanonicalProcessName.mockReturnValue('Welding');
    const { buildInspectionIssueCreateData } = await import(
      '~/modules/inspection/inspection-issue'
    );

    await buildCloseLinkedIssueCreateResult({
      body: { unqualifiedQuantity: 1 },
      inspectionId: 'i-1',
      linkedIssue: {
        processName: '进货检验',
        responsibleDepartment: 'dept-assembly',
      },
      request: {
        partName: 'Part',
        processName: 'Welding',
        reporter: 'Reporter',
        workOrderNumber: 'WO-1',
      },
      tx,
      userinfo: { id: 'user-1', username: 'admin' } as any,
    });

    expect(buildInspectionIssueCreateData).toHaveBeenLastCalledWith(
      expect.objectContaining({
        responsibleDepartment: 'Final Assembly Team',
        supplierId: undefined,
      }),
      expect.any(Object),
    );
  });
});
