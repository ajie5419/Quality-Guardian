import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isIncomingInspectionRequestProcess } from '~/modules/inspection/inspection-request';
import { InspectionRequestCreateService } from '~/modules/inspection/inspection-request-create.service';
import { PartMasterService } from '~/modules/part-master';
import { ProcessMasterService } from '~/modules/process-master';
import prisma from '~/utils/prisma';

vi.mock('~/utils/prisma', () => ({
  default: {
    $transaction: vi.fn(),
  },
}));

vi.mock('~/modules/process-master', () => ({
  ProcessMasterService: {
    assertInspectionRequestOption: vi.fn(),
  },
}));

vi.mock('~/modules/part-master', () => ({
  PartMasterService: {
    assertActive: vi.fn(),
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

vi.mock('~/utils/canonical-master-data', () => ({
  MasterDataGovernanceKernel: {
    resolveCanonicalNameById: vi.fn(({ configKey }: { configKey: string }) =>
      Promise.resolve(
        configKey === 'partName' ? 'Canonical Part' : 'Canonical Process',
      ),
    ),
  },
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
    vi.mocked(isIncomingInspectionRequestProcess).mockReturnValue(false);
    vi.mocked(
      ProcessMasterService.assertInspectionRequestOption,
    ).mockResolvedValue({
      id: 'process-1',
      name: 'Canonical Process',
    });
    vi.mocked(PartMasterService.assertActive).mockResolvedValue({
      id: 'part-1',
      name: 'Canonical Part',
    });
  });

  it('rejects a V2 process that is hidden for the requested category', async () => {
    vi.mocked(
      ProcessMasterService.assertInspectionRequestOption,
    ).mockRejectedValue(
      new Error('The selected process is not enabled for this category'),
    );

    await expect(
      InspectionRequestCreateService.createRequest(
        {} as any,
        { id: 'user-1', username: 'admin' } as any,
        {
          category: 'PROCESS',
          componentName: 'Component A',
          partId: 'part-1',
          processId: 'process-1',
          teamId: 'team-1',
          workOrderNumber: 'WO-001',
        },
        false,
        'V2',
      ),
    ).rejects.toThrow('not enabled');
    expect(prisma.$transaction).not.toHaveBeenCalled();
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
        componentName: 'Component A',
        partName: 'Bearing',
        processName: 'Welding',
        workOrderNumber: 'WO-001',
      },
    );

    expect(result).toBeDefined();
    expect(result.id).toBe('req-1');
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('uses V2 IDs to rebuild canonical names', async () => {
    const { buildGovernedCanonicalWritePairForTable } = await import(
      '~/utils/governed-write'
    );
    vi.mocked(buildGovernedCanonicalWritePairForTable).mockResolvedValueOnce({
      partId: 'part-1',
      partName: 'Canonical Part',
      processId: 'process-1',
      processName: 'Canonical Process',
    });
    const create = vi.fn().mockResolvedValue(mockRequest);
    (prisma.$transaction as any).mockImplementation(async (callback: any) =>
      callback({ qms_inspection_requests: { create } }),
    );

    await InspectionRequestCreateService.createRequest(
      {} as any,
      { id: 'user-1', username: 'admin' } as any,
      {
        category: 'PROCESS',
        componentName: 'Component A',
        partId: 'part-1',
        processId: 'process-1',
        teamId: 'team-1',
        workOrderNumber: 'WO-001',
      },
      false,
      'V2',
    );

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          category: 'PROCESS',
          partId: 'part-1',
          partName: 'Canonical Part',
          processId: 'process-1',
          processName: 'Canonical Process',
        }),
      }),
    );
  });

  it('creates a pending material application in the request transaction', async () => {
    const { WxSubscribeMessageService } = await import('~/modules/user');
    const { buildGovernedCanonicalWritePairForTable } = await import(
      '~/utils/governed-write'
    );
    vi.mocked(buildGovernedCanonicalWritePairForTable).mockResolvedValueOnce({
      processId: 'process-1',
      processName: 'Incoming inspection',
    });
    const create = vi.fn().mockResolvedValue({
      ...mockRequest,
      materialRequest: {
        requestedName: 'Unregistered bearing',
        status: 'PENDING',
      },
      partName: 'Unregistered bearing',
    });
    (prisma.$transaction as any).mockImplementation(async (callback: any) =>
      callback({ qms_inspection_requests: { create } }),
    );

    await InspectionRequestCreateService.createRequest(
      {} as any,
      null,
      {
        category: 'INCOMING',
        processId: 'process-1',
        reporter: 'Workshop',
        requestedPartName: 'Unregistered bearing',
        supplierId: 'supplier-1',
        workOrderNumber: 'WO-001',
      },
      true,
      'V2',
    );

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          materialRequest: {
            create: { requestedName: 'Unregistered bearing' },
          },
          partId: null,
          partName: 'Unregistered bearing',
        }),
      }),
    );
    expect(
      WxSubscribeMessageService.sendPendingDispatchCreated,
    ).not.toHaveBeenCalled();
  });

  it.each([
    {
      body: {
        componentName: 'Component A',
        partName: 'Bearing',
        processName: 'Welding',
        teamId: 'team-1',
        workOrderNumber: 'WO-001',
      },
      category: 'PROCESS',
      incoming: false,
    },
    {
      body: {
        partName: 'Bearing',
        processName: 'Incoming inspection',
        supplierId: 'supplier-1',
        workOrderNumber: 'WO-001',
      },
      category: 'INCOMING',
      incoming: true,
    },
  ])('persists $category category on creation', async (scenario) => {
    vi.mocked(isIncomingInspectionRequestProcess).mockReturnValue(
      scenario.incoming,
    );
    const create = vi.fn().mockResolvedValue(mockRequest);
    (prisma.$transaction as any).mockImplementation(async (callback: any) =>
      callback({ qms_inspection_requests: { create } }),
    );

    await InspectionRequestCreateService.createRequest(
      {} as any,
      { id: 'user-1', username: 'admin' } as any,
      scenario.body,
    );

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ category: scenario.category }),
      }),
    );
  });

  it('rejects V2 non-assembly process requests without a component', async () => {
    await expect(
      InspectionRequestCreateService.createRequest(
        {} as any,
        { id: 'user-1', username: 'admin' } as any,
        {
          category: 'PROCESS',
          partId: 'part-1',
          processId: 'process-1',
          teamId: 'team-1',
          workOrderNumber: 'WO-001',
        },
        false,
        'V2',
      ),
    ).rejects.toMatchObject({ code: 'COMPONENT_NAME_REQUIRED' });
    expect(prisma.$transaction).not.toHaveBeenCalled();
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
      {
        componentName: 'Component A',
        partName: 'Bearing',
        processName: 'Welding',
      },
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
      {
        componentName: 'Component A',
        partName: 'Bearing',
        processName: 'Welding',
      },
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
      {
        componentName: 'Component A',
        partName: 'Bearing',
        processName: 'Welding',
      },
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
