import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildCloseLinkedIssueCreateResult } from '~/modules/inspection/inspection-request-close-issue.service';

vi.mock('~/utils/governed-write', () => ({
  buildGovernedWriteFieldsForTable: vi.fn().mockReturnValue({}),
}));

vi.mock('~/utils/process-resolver', () => ({
  resolveCanonicalProcessName: vi.fn().mockReturnValue('Process A'),
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
  });

  it('should return auditVariables and createData', async () => {
    const result = await buildCloseLinkedIssueCreateResult({
      body: { unqualifiedQuantity: 3 },
      inspectionId: 'i-1',
      linkedIssue: {
        defectType: 'Welding defect',
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
    expect(result.auditVariables.nonConformanceNumber).toBe('QC-001');
    expect(result.createData).toBeDefined();
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
        workOrderNumber: 'WO-1',
      },
      userinfo: { id: 'user-1', username: 'admin' } as any,
    });

    expect(buildInspectionIssueCreateData).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: 'Minor',
        sourceType: 'INSPECTION_REQUEST',
        status: 'OPEN',
      }),
      expect.any(Object),
    );
  });
});
