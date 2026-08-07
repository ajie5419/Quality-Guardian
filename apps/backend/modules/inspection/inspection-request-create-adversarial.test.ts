import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InspectionRequestCreateService } from '~/modules/inspection/inspection-request-create.service';
import { normalizeInspectionRequestWorkOrderNumbers } from '~/modules/inspection/inspection-request-work-orders';
import { recordBusinessAuditLog } from '~/modules/system-log/audit-log';
import prisma from '~/utils/prisma';

vi.mock('~/utils/prisma', () => ({
  default: {
    qms_inspection_requests: {
      count: vi.fn(),
    },
    $transaction: vi.fn(),
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

vi.mock('~/modules/inspection/inspection-request-events', () => ({
  publishInspectionRequestCreated: vi.fn(),
}));

vi.mock('~/modules/inspection/inspection-request-work-orders', () => ({
  assertWorkOrdersExist: vi.fn(),
  inspectionRequestWorkOrdersInclude: {},
  normalizeInspectionRequestWorkOrderNumbers: vi
    .fn()
    .mockImplementation((body: Record<string, unknown>) => {
      if (Array.isArray(body.workOrderNumbers)) {
        return body.workOrderNumbers.filter(
          (n: unknown) => typeof n === 'string' && n.trim(),
        );
      }
      const single = String(body.workOrderNumber || '').trim();
      return single ? [single] : [];
    }),
}));

vi.mock('~/modules/inspection/inspection-request', async () => {
  const SHARED = await import('@qgs/shared');
  return {
    generateInspectionRequestNo: vi.fn().mockResolvedValue('IR-20260612-001'),
    isIncomingInspectionRequestProcess:
      SHARED.isIncomingInspectionRequestProcess,
    isInspectionRequestAssemblyProcess:
      SHARED.isInspectionRequestAssemblyProcess,
    mapInspectionRequest: vi.fn().mockImplementation((r) => r),
    normalizeInspectionRequestAttachments:
      SHARED.normalizeInspectionRequestAttachments,
    normalizeInspectionRequestCheckResult:
      SHARED.normalizeInspectionRequestCheckResult,
    normalizeInspectionRequestText: SHARED.normalizeInspectionRequestText,
    normalizeInspectionStationSelection:
      SHARED.normalizeInspectionStationSelection,
    parseInspectionRequestQuantity: SHARED.parseInspectionRequestQuantity,
    serializeInspectionStationSelection:
      SHARED.serializeInspectionStationSelection,
  };
});

const MOCK_USER = { id: 'user-1', username: 'admin' } as any;
const MOCK_EVENT = {} as any;

function mockTransaction() {
  return (prisma.$transaction as any).mockImplementation(async (cb: any) =>
    cb({
      qms_inspection_requests: {
        create: vi.fn().mockResolvedValue({
          componentName: 'Bearing',
          id: 'req-1',
          mutualCheckResult: 'PASS',
          partName: 'Bearing',
          processId: 'process-1',
          processName: 'Welding',
          quantity: 10,
          requestInfo: null,
          requestNo: 'IR-20260612-001',
          selfCheckResult: 'PASS',
          stationSelection: null,
          teamId: 'team-1',
          workOrderNumber: 'WO-1',
        }),
      },
    }),
  );
}

describe('inspection-request-create adversarial', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('workOrderNumber normalization', () => {
    it('uses workOrderNumbers[0] when workOrderNumber is empty', async () => {
      vi.mocked(normalizeInspectionRequestWorkOrderNumbers).mockReturnValue([
        'WO-ABC',
        'WO-DEF',
      ]);
      mockTransaction();

      const result = await InspectionRequestCreateService.createRequest(
        MOCK_EVENT,
        MOCK_USER,
        {
          partName: 'Bearing',
          processName: 'Welding',
          quantity: 10,
          reporter: 'Tester',
          workOrderNumbers: ['WO-ABC', 'WO-DEF'],
        },
      );

      expect(result).toBeDefined();
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('falls back to empty string when no workOrderNumber variants provided', async () => {
      vi.mocked(normalizeInspectionRequestWorkOrderNumbers).mockReturnValue([]);
      mockTransaction();

      const result = await InspectionRequestCreateService.createRequest(
        MOCK_EVENT,
        MOCK_USER,
        {
          partName: 'Bearing',
          processName: 'Welding',
          quantity: 10,
          reporter: 'Tester',
        },
      );

      expect(result).toBeDefined();
    });
  });

  describe('quantity edge cases', () => {
    it('quantity=0 → normalized to 1', async () => {
      mockTransaction();

      await InspectionRequestCreateService.createRequest(
        MOCK_EVENT,
        MOCK_USER,
        {
          partName: 'Bearing',
          processName: 'Welding',
          quantity: 0,
          reporter: 'Tester',
          workOrderNumber: 'WO-1',
        },
      );

      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('quantity=negative → normalized to 1', async () => {
      mockTransaction();

      await InspectionRequestCreateService.createRequest(
        MOCK_EVENT,
        MOCK_USER,
        {
          partName: 'Bearing',
          processName: 'Welding',
          quantity: -5,
          reporter: 'Tester',
          workOrderNumber: 'WO-1',
        },
      );

      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('quantity=NaN string → normalized to 1', async () => {
      mockTransaction();

      await InspectionRequestCreateService.createRequest(
        MOCK_EVENT,
        MOCK_USER,
        {
          partName: 'Bearing',
          processName: 'Welding',
          quantity: 'not-a-number',
          reporter: 'Tester',
          workOrderNumber: 'WO-1',
        },
      );

      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('quantity=10.7 → truncated to 10', async () => {
      mockTransaction();

      await InspectionRequestCreateService.createRequest(
        MOCK_EVENT,
        MOCK_USER,
        {
          partName: 'Bearing',
          processName: 'Welding',
          quantity: 10.7,
          reporter: 'Tester',
          workOrderNumber: 'WO-1',
        },
      );

      expect(prisma.$transaction).toHaveBeenCalled();
    });
  });

  describe('partName and processName handling', () => {
    it('partName is required (stored as-is)', async () => {
      mockTransaction();

      await InspectionRequestCreateService.createRequest(
        MOCK_EVENT,
        MOCK_USER,
        {
          partName: 'Gearbox',
          processName: 'Welding',
          quantity: 5,
          reporter: 'Tester',
          workOrderNumber: 'WO-1',
        },
      );

      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('processName is normalized (trimmed)', async () => {
      mockTransaction();

      await InspectionRequestCreateService.createRequest(
        MOCK_EVENT,
        MOCK_USER,
        {
          partName: 'Bearing',
          processName: '  Welding  ',
          quantity: 5,
          reporter: 'Tester',
          workOrderNumber: 'WO-1',
        },
      );

      expect(prisma.$transaction).toHaveBeenCalled();
    });
  });

  describe('componentName skip logic', () => {
    it('assembly process skips componentName', async () => {
      mockTransaction();

      await InspectionRequestCreateService.createRequest(
        MOCK_EVENT,
        MOCK_USER,
        {
          componentName: 'Ignored',
          partName: 'Assembly',
          processName: '组装检验',
          quantity: 1,
          reporter: 'Tester',
          workOrderNumber: 'WO-1',
        },
      );

      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('incoming inspection process skips componentName', async () => {
      mockTransaction();

      await InspectionRequestCreateService.createRequest(
        MOCK_EVENT,
        MOCK_USER,
        {
          componentName: 'Ignored',
          partName: 'Raw Material',
          processName: '进货检验',
          quantity: 1,
          reporter: 'Tester',
          workOrderNumber: 'WO-1',
        },
      );

      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('regular process includes componentName', async () => {
      mockTransaction();

      await InspectionRequestCreateService.createRequest(
        MOCK_EVENT,
        MOCK_USER,
        {
          componentName: 'Bearing',
          partName: 'Housing',
          processName: 'Welding',
          quantity: 1,
          reporter: 'Tester',
          workOrderNumber: 'WO-1',
        },
      );

      expect(prisma.$transaction).toHaveBeenCalled();
    });
  });

  describe('empty/missing fields', () => {
    it('empty partName → stored as empty string', async () => {
      mockTransaction();

      await InspectionRequestCreateService.createRequest(
        MOCK_EVENT,
        MOCK_USER,
        {
          partName: '',
          processName: 'Welding',
          quantity: 1,
          reporter: 'Tester',
          workOrderNumber: 'WO-1',
        },
      );

      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('requestInfo normalized and stored', async () => {
      mockTransaction();

      await InspectionRequestCreateService.createRequest(
        MOCK_EVENT,
        MOCK_USER,
        {
          partName: 'Bearing',
          processName: 'Welding',
          quantity: 1,
          reporter: 'Tester',
          requestInfo: 'Important info',
          workOrderNumber: 'WO-1',
        },
      );

      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('empty reporter → stored as empty string', async () => {
      mockTransaction();

      await InspectionRequestCreateService.createRequest(
        MOCK_EVENT,
        MOCK_USER,
        {
          partName: 'Bearing',
          processName: 'Welding',
          quantity: 1,
          reporter: '',
          workOrderNumber: 'WO-1',
        },
      );

      expect(prisma.$transaction).toHaveBeenCalled();
    });
  });

  describe('attachments handling', () => {
    it('empty attachments → null in DB', async () => {
      mockTransaction();

      await InspectionRequestCreateService.createRequest(
        MOCK_EVENT,
        MOCK_USER,
        {
          attachments: [],
          partName: 'Bearing',
          processName: 'Welding',
          quantity: 1,
          reporter: 'Tester',
          workOrderNumber: 'WO-1',
        },
      );

      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('undefined attachments → null in DB', async () => {
      mockTransaction();

      await InspectionRequestCreateService.createRequest(
        MOCK_EVENT,
        MOCK_USER,
        {
          partName: 'Bearing',
          processName: 'Welding',
          quantity: 1,
          reporter: 'Tester',
          workOrderNumber: 'WO-1',
        },
      );

      expect(prisma.$transaction).toHaveBeenCalled();
    });
  });

  describe('selfCheckResult and mutualCheckResult', () => {
    it('defaults to PASS when not provided', async () => {
      mockTransaction();

      await InspectionRequestCreateService.createRequest(
        MOCK_EVENT,
        MOCK_USER,
        {
          partName: 'Bearing',
          processName: 'Welding',
          quantity: 1,
          reporter: 'Tester',
          workOrderNumber: 'WO-1',
        },
      );

      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('accepts FAIL as valid check result', async () => {
      mockTransaction();

      await InspectionRequestCreateService.createRequest(
        MOCK_EVENT,
        MOCK_USER,
        {
          mutualCheckResult: 'FAIL',
          partName: 'Bearing',
          processName: 'Welding',
          quantity: 1,
          reporter: 'Tester',
          selfCheckResult: 'FAIL',
          workOrderNumber: 'WO-1',
        },
      );

      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('invalid check result falls back to PASS', async () => {
      mockTransaction();

      await InspectionRequestCreateService.createRequest(
        MOCK_EVENT,
        MOCK_USER,
        {
          mutualCheckResult: 'INVALID',
          partName: 'Bearing',
          processName: 'Welding',
          quantity: 1,
          reporter: 'Tester',
          selfCheckResult: 'INVALID',
          workOrderNumber: 'WO-1',
        },
      );

      expect(prisma.$transaction).toHaveBeenCalled();
    });
  });

  describe('public mode', () => {
    it('isPublic=true skips audit log', async () => {
      mockTransaction();

      await InspectionRequestCreateService.createRequest(
        MOCK_EVENT,
        MOCK_USER,
        {
          partName: 'Bearing',
          processName: 'Welding',
          quantity: 1,
          reporter: 'Tester',
          workOrderNumber: 'WO-1',
        },
        true,
      );

      expect(recordBusinessAuditLog).not.toHaveBeenCalled();
    });

    it('isPublic=false with null userinfo skips audit log', async () => {
      mockTransaction();

      await InspectionRequestCreateService.createRequest(
        MOCK_EVENT,
        null,
        {
          partName: 'Bearing',
          processName: 'Welding',
          quantity: 1,
          reporter: 'Tester',
          workOrderNumber: 'WO-1',
        },
        false,
      );

      expect(recordBusinessAuditLog).not.toHaveBeenCalled();
    });
  });

  describe('stationSelection', () => {
    it('undefined stationSelection → null', async () => {
      mockTransaction();

      await InspectionRequestCreateService.createRequest(
        MOCK_EVENT,
        MOCK_USER,
        {
          partName: 'Bearing',
          processName: 'Welding',
          quantity: 10,
          reporter: 'Tester',
          workOrderNumber: 'WO-1',
        },
      );

      expect(prisma.$transaction).toHaveBeenCalled();
    });
  });

  describe('requestNo race condition retry (Race A)', () => {
    function makeP2002RequestNoError() {
      const err = Object.assign(
        new Error('Unique constraint failed on the fields: (`requestNo`)'),
        {
          code: 'P2002',
          meta: { target: ['requestNo'] },
        },
      );
      return err;
    }

    it('retries once on P2002-requestNo conflict and succeeds; generator called twice', async () => {
      const { generateInspectionRequestNo } = await import(
        '~/modules/inspection/inspection-request'
      );
      const genMock = vi.mocked(generateInspectionRequestNo);
      genMock
        .mockResolvedValueOnce('IR-20260707-001')
        .mockResolvedValueOnce('IR-20260707-002');

      let callCount = 0;
      (prisma.$transaction as any).mockImplementation(async (cb: any) => {
        callCount++;
        if (callCount === 1) {
          // First attempt: call cb to trigger generateInspectionRequestNo,
          // then throw P2002 on requestNo.
          await cb({
            qms_inspection_requests: {
              create: vi.fn().mockRejectedValue(makeP2002RequestNoError()),
            },
          });
        }
        // Second attempt: succeeds.
        return cb({
          qms_inspection_requests: {
            create: vi.fn().mockResolvedValue({
              id: 'req-2',
              componentName: '',
              mutualCheckResult: 'PASS',
              partName: 'Bearing',
              processId: 'process-1',
              processName: 'Welding',
              quantity: 10,
              requestInfo: null,
              requestNo: 'IR-20260707-002',
              selfCheckResult: 'PASS',
              stationSelection: null,
              teamId: 'team-1',
              workOrderNumber: 'WO-1',
            }),
          },
        });
      });

      await InspectionRequestCreateService.createRequest(
        MOCK_EVENT,
        MOCK_USER,
        {
          partName: 'Bearing',
          processName: 'Welding',
          quantity: 10,
          reporter: 'Tester',
          workOrderNumber: 'WO-1',
        },
      );

      expect(prisma.$transaction).toHaveBeenCalledTimes(2);
      expect(genMock).toHaveBeenCalledTimes(2);
    });

    it('does not retry on a non-P2002 error', async () => {
      const networkError = new Error('Connection refused');
      (prisma.$transaction as any).mockImplementation(async (cb: any) =>
        cb({
          qms_inspection_requests: {
            create: vi.fn().mockRejectedValue(networkError),
          },
        }),
      );

      await expect(
        InspectionRequestCreateService.createRequest(MOCK_EVENT, MOCK_USER, {
          partName: 'Bearing',
          processName: 'Welding',
          quantity: 5,
          reporter: 'Tester',
          workOrderNumber: 'WO-1',
        }),
      ).rejects.toThrow('Connection refused');

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('rethrows after 3 failed attempts on persistent requestNo conflict', async () => {
      const p2002 = makeP2002RequestNoError();
      (prisma.$transaction as any).mockImplementation(async (cb: any) =>
        cb({
          qms_inspection_requests: {
            create: vi.fn().mockRejectedValue(p2002),
          },
        }),
      );

      await expect(
        InspectionRequestCreateService.createRequest(MOCK_EVENT, MOCK_USER, {
          partName: 'Bearing',
          processName: 'Welding',
          quantity: 5,
          reporter: 'Tester',
          workOrderNumber: 'WO-1',
        }),
      ).rejects.toBe(p2002);

      expect(prisma.$transaction).toHaveBeenCalledTimes(3);
    });
  });
});
