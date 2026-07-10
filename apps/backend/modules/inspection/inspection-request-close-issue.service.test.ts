import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildCloseLinkedIssueCreateResult } from '~/modules/inspection/inspection-request-close-issue.service';

const { mockFindFirstSupplier, mockResolveCanonicalProcessName } = vi.hoisted(
  () => ({
    mockFindFirstSupplier: vi.fn(),
    mockResolveCanonicalProcessName: vi.fn(),
  }),
);

vi.mock('~/utils/prisma', () => ({
  default: {
    suppliers: {
      findFirst: mockFindFirstSupplier,
    },
  },
}));

vi.mock('~/utils/governed-write', () => ({
  buildGovernedWriteFieldsForTable: vi.fn().mockReturnValue({}),
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
    work_order: { division: 'D1' },
  }),
  getNextInspectionIssueSerialNumber: vi.fn().mockResolvedValue(1),
}));

vi.mock('~/modules/inspection/inspection-request', () => ({
  normalizeInspectionRequestText: vi.fn().mockImplementation((v) => v || ''),
}));

vi.mock('~/modules/inspection/inspection-request-close.schema', () => ({
  parseCloseRequestNumber: (value: unknown, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  },
}));

describe('buildCloseLinkedIssueCreateResult', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindFirstSupplier.mockResolvedValue(null);
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
      userinfo: { id: 'user-1', username: 'admin' } as any,
    });

    expect(result.auditVariables).toBeDefined();
    expect(result.auditVariables.nonConformanceNumber).toBe('NC-2026-001');
    expect(result.createData).toBeDefined();
    const { buildInspectionIssueCreateData } = await import(
      '~/modules/inspection/inspection-issue'
    );
    expect(buildInspectionIssueCreateData).toHaveBeenCalledWith(
      expect.objectContaining({
        ncNumber: 'NC-2026-001',
      }),
      expect.objectContaining({ createdBy: 'user-1' }),
    );
  });

  it('should use defaults for missing fields', async () => {
    const { buildInspectionIssueCreateData } = await import(
      '~/modules/inspection/inspection-issue'
    );

    await buildCloseLinkedIssueCreateResult({
      body: { unqualifiedQuantity: 1 },
      inspectionId: 'i-1',
      linkedIssue: {},
      request: {
        componentName: null,
        partName: 'Part',
        process: null,
        processName: 'Process',
        reporter: 'Reporter',
        team: 'Final Assembly Team',
        workOrderNumber: 'WO-1',
      },
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
      linkedIssue: {},
      request: {
        componentName: null,
        partName: 'Part',
        process: null,
        processName: 'Process',
        reporter: 'Reporter',
        team: 'Final Assembly Team',
        workOrderNumber: 'WO-1',
      },
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
        responsibleDepartment: 'Supplier A',
      },
      request: {
        componentName: null,
        partName: 'Part',
        process: null,
        processName: '进货检验',
        reporter: 'Reporter',
        team: 'Supplier A',
        workOrderNumber: 'WO-1',
      },
      userinfo: { id: 'user-1', username: 'admin' } as any,
    });

    expect(buildInspectionIssueCreateData).toHaveBeenLastCalledWith(
      expect.objectContaining({
        responsibleDepartment: '采购部',
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
        responsibleDepartment: 'Outsourcing Plant A',
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
      userinfo: { id: 'user-1', username: 'admin' } as any,
    });

    expect(buildInspectionIssueCreateData).toHaveBeenLastCalledWith(
      expect.objectContaining({
        responsibleDepartment: '生产 OBU',
        supplierName: 'Outsourcing Plant A',
      }),
      expect.any(Object),
    );
  });

  it('uses outsourcing supplier table match when process name is internal', async () => {
    mockResolveCanonicalProcessName.mockReturnValue('Welding');
    mockFindFirstSupplier.mockResolvedValue({ id: 'supplier-1' });
    const { buildInspectionIssueCreateData } = await import(
      '~/modules/inspection/inspection-issue'
    );

    await buildCloseLinkedIssueCreateResult({
      body: { unqualifiedQuantity: 1 },
      inspectionId: 'i-1',
      linkedIssue: {},
      request: {
        componentName: null,
        partName: 'Part',
        process: null,
        processName: 'Welding',
        reporter: 'Reporter',
        team: 'Outsourcing Plant A',
        workOrderNumber: 'WO-1',
      },
      userinfo: { id: 'user-1', username: 'admin' } as any,
    });

    expect(mockFindFirstSupplier).toHaveBeenCalledWith({
      select: { id: true },
      where: {
        category: 'Outsourcing',
        isDeleted: false,
        name: 'Outsourcing Plant A',
      },
    });
    expect(buildInspectionIssueCreateData).toHaveBeenLastCalledWith(
      expect.objectContaining({
        responsibleDepartment: '生产 OBU',
        supplierName: 'Outsourcing Plant A',
      }),
      expect.any(Object),
    );
  });
});
