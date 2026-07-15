import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InspectionRequestCreateService } from '~/modules/inspection/inspection-request-create.service';
import prisma from '~/utils/prisma';

vi.mock('~/utils/prisma', () => ({
  default: {
    $transaction: vi.fn(),
  },
}));

vi.mock('~/modules/file-storage/file-storage.service', () => ({
  FileStorageService: {
    registerReferencesFromAttachments: vi.fn(),
  },
}));

vi.mock('~/modules/supplier-identity', () => ({
  SupplierIdentityService: {
    resolveSupplierById: vi.fn().mockResolvedValue({
      id: 'supplier-1',
      name: 'Supplier A',
    }),
    resolveTeamById: vi.fn().mockResolvedValue({
      id: 'team-1',
      name: 'Team A',
    }),
  },
}));

vi.mock('~/modules/system-log/audit-log', () => ({
  recordBusinessAuditLog: vi.fn(),
}));

vi.mock('~/modules/user', () => ({
  WxSubscribeMessageService: {
    sendPendingDispatchCreated: vi.fn(),
  },
}));

vi.mock('~/utils/governed-write', () => ({
  buildGovernedCanonicalWritePairForTable: vi.fn().mockResolvedValue({}),
  buildGovernedWriteFieldsForTable: vi.fn().mockReturnValue({}),
}));

vi.mock('~/utils/process-resolver', () => ({
  resolveCanonicalProcessName: vi.fn().mockReturnValue(''),
  resolveProcessIdForWrite: vi.fn().mockResolvedValue('process-1'),
}));

vi.mock('~/utils/team-resolver', () => ({
  resolveTeamIdForWrite: vi.fn().mockResolvedValue('team-1'),
}));

vi.mock('~/utils/telegram-bot', () => ({
  notifyTelegramNewRequest: vi.fn(),
}));

vi.mock('~/modules/inspection/inspection-request', () => ({
  generateInspectionRequestNo: vi.fn().mockResolvedValue('REQ-20260611-001'),
  isIncomingInspectionRequestProcess: vi.fn().mockReturnValue(false),
  isInspectionRequestAssemblyProcess: vi.fn().mockReturnValue(false),
  mapInspectionRequest: vi.fn().mockImplementation((r) => r),
  normalizeInspectionRequestAttachments: vi.fn().mockReturnValue([]),
  normalizeInspectionRequestCheckResult: vi.fn().mockReturnValue('PASS'),
  normalizeInspectionRequestText: vi.fn().mockImplementation((v) => v || ''),
  parseInspectionRequestQuantity: vi.fn().mockReturnValue(1),
  serializeInspectionStationSelection: vi.fn().mockReturnValue(''),
}));

vi.mock('~/modules/inspection/inspection-request-events', () => ({
  publishInspectionRequestCreated: vi.fn(),
}));

vi.mock('~/modules/inspection/inspection-request-work-orders', () => ({
  assertWorkOrdersExist: vi.fn(),
  inspectionRequestWorkOrdersInclude: {},
  normalizeInspectionRequestWorkOrderNumbers: vi.fn().mockReturnValue([]),
}));

const mockRequest = {
  id: 'req-1',
  partName: 'Bearing',
  processName: 'Welding',
  reporter: 'Workshop',
  requestNo: 'REQ-20260611-001',
  workOrderNumber: 'WO-001',
};

describe('inspectionRequestCreateService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create a request and return mapped result', async () => {
    (prisma.$transaction as any).mockImplementation(async (cb: any) =>
      cb({
        qms_inspection_requests: {
          create: vi.fn().mockResolvedValue(mockRequest),
        },
      }),
    );

    const result = await InspectionRequestCreateService.createRequest(
      {} as any,
      { id: 'user-1', username: 'admin' } as any,
      {
        partName: 'Bearing',
        processName: 'Welding',
        workOrderNumber: 'WO-001',
      },
    );

    expect(result).toBeDefined();
    expect(result.id).toBe('req-1');
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('should not audit log when isPublic is true', async () => {
    const { recordBusinessAuditLog } = await import(
      '~/modules/system-log/audit-log'
    );
    (prisma.$transaction as any).mockImplementation(async (cb: any) =>
      cb({
        qms_inspection_requests: {
          create: vi.fn().mockResolvedValue(mockRequest),
        },
      }),
    );

    await InspectionRequestCreateService.createRequest(
      {} as any,
      { id: 'user-1', username: 'admin' } as any,
      { partName: 'Bearing', processName: 'Welding' },
      true,
    );

    expect(recordBusinessAuditLog).not.toHaveBeenCalled();
  });

  it('should call publishInspectionRequestCreated after creation', async () => {
    const { publishInspectionRequestCreated } = await import(
      '~/modules/inspection/inspection-request-events'
    );
    (prisma.$transaction as any).mockImplementation(async (cb: any) =>
      cb({
        qms_inspection_requests: {
          create: vi.fn().mockResolvedValue(mockRequest),
        },
      }),
    );

    await InspectionRequestCreateService.createRequest(
      {} as any,
      { id: 'user-1', username: 'admin' } as any,
      { partName: 'Bearing', processName: 'Welding' },
    );

    expect(publishInspectionRequestCreated).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'req-1' }),
    );
  });

  it('should send pending dispatch notification after creation', async () => {
    const { WxSubscribeMessageService } = await import('~/modules/user');
    (prisma.$transaction as any).mockImplementation(async (cb: any) =>
      cb({
        qms_inspection_requests: {
          create: vi.fn().mockResolvedValue(mockRequest),
        },
      }),
    );

    await InspectionRequestCreateService.createRequest(
      {} as any,
      { id: 'user-1', username: 'admin' } as any,
      { partName: 'Bearing', processName: 'Welding' },
    );

    expect(
      WxSubscribeMessageService.sendPendingDispatchCreated,
    ).toHaveBeenCalledWith({
      partName: 'Bearing',
      reporter: 'Workshop',
      requestNo: 'REQ-20260611-001',
      workOrderNumber: 'WO-001',
    });
  });
});
