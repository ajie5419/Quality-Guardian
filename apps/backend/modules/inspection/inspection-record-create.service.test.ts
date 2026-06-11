import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InspectionRecordCreateService } from '~/modules/inspection/inspection-record-create.service';
import prisma from '~/utils/prisma';

vi.mock('~/utils/prisma', () => ({
  default: {
    inspections: {
      findFirst: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock('~/utils/governed-write', () => ({
  buildGovernedCanonicalWritePairForTable: vi.fn().mockResolvedValue({}),
  buildGovernedWriteFieldsForTable: vi.fn().mockReturnValue({}),
}));

vi.mock('~/utils/process-resolver', () => ({
  resolveCanonicalProcessNameById: vi.fn().mockResolvedValue('Welding'),
  resolveProcessIdForWrite: vi.fn().mockResolvedValue('process-1'),
}));

vi.mock('~/utils/team-resolver', () => ({
  resolveTeamIdForWrite: vi.fn().mockResolvedValue('team-1'),
}));

vi.mock('~/modules/file-storage/file-storage.service', () => ({
  FileStorageService: {
    registerReferencesFromAttachments: vi.fn(),
  },
}));

vi.mock('~/utils/prisma-error', () => ({
  isPrismaUniqueConstraintError: vi.fn().mockReturnValue(false),
}));

vi.mock('~/utils/logger', () => ({
  createModuleLogger: vi.fn().mockReturnValue({ warn: vi.fn() }),
}));

vi.mock('~/modules/inspection/inspection-archive-sync.service', () => ({
  syncInspectionArchiveTask: vi.fn(),
}));

vi.mock(
  '~/modules/inspection/inspection-project-document-sync.service',
  () => ({
    syncInspectionProjectDocuments: vi.fn(),
  }),
);

vi.mock('~/modules/inspection/inspection-template-binding.service', () => ({
  resolveInspectionTemplateBinding: vi.fn().mockResolvedValue({
    templateId: null,
    templateName: null,
  }),
}));

vi.mock('~/modules/inspection/inspection-record-types', () => ({
  InspectionRecordRules: {
    resolveOverallResult: vi.fn().mockReturnValue('PASS'),
    normalizeQuantitySummary: vi.fn().mockReturnValue({
      qualifiedQuantity: 10,
      quantity: 10,
      unqualifiedQuantity: 0,
    }),
    assertResultQuantityConsistency: vi.fn(),
  },
}));

describe('inspectionRecordCreateService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('generateSerialNumber', () => {
    it('should return INS-YYYYMMDD-001 when no existing records', async () => {
      (prisma.inspections.findFirst as any).mockResolvedValue(null);

      const sn = await InspectionRecordCreateService.generateSerialNumber();

      expect(sn).toMatch(/^INS-\d{8}-001$/);
    });

    it('should increment existing sequence', async () => {
      const dateStr = new Date().toISOString().slice(0, 10).replaceAll('-', '');
      (prisma.inspections.findFirst as any).mockResolvedValue({
        serialNumber: `INS-${dateStr}-005`,
      });

      const sn = await InspectionRecordCreateService.generateSerialNumber();
      const seq = sn.split('-')[2];
      expect(seq).toBe('006');
    });
  });

  describe('create', () => {
    it('should call prisma transaction with correct data', async () => {
      const mockInspection = { id: 'insp-1', serialNumber: 'INS-001' };
      (prisma.$transaction as any).mockImplementation(async (cb: any) =>
        cb({
          inspections: {
            create: vi.fn().mockResolvedValue(mockInspection),
          },
        }),
      );

      const result = await InspectionRecordCreateService.create({
        category: 'PROCESS',
        inspector: 'Tester',
        inspectionDate: '2026-01-01',
        items: [],
        processName: 'Welding',
        quantity: 10,
        qualifiedQuantity: 10,
        unqualifiedQuantity: 0,
        workOrderNumber: 'WO-1',
      } as any);

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(result).toEqual(mockInspection);
    });
  });
});
