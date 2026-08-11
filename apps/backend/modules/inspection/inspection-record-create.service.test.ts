import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InspectionRecordCreateService } from '~/modules/inspection/inspection-record-create.service';
import { MetricRefreshQueue } from '~/modules/metric-refresh';
import { buildGovernedCanonicalWritePairForTable } from '~/utils/governed-write';
import prisma from '~/utils/prisma';

import { resolveInspectionIssueResponsibility } from './inspection-issue-responsibility.service';

vi.mock('~/utils/prisma', () => ({
  default: {
    inspections: {
      findFirst: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock('~/modules/metric-refresh', () => ({
  MetricRefreshQueue: {
    enqueueSupplierScoresForInspectionIdentities: vi.fn(),
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

vi.mock('~/modules/supplier-identity', () => ({
  SupplierIdentityService: {
    resolveSupplierById: vi
      .fn()
      .mockResolvedValue({ id: 'supplier-1', name: 'Supplier A' }),
    resolveSupplierForInspection: vi
      .fn()
      .mockResolvedValue({ id: 'supplier-1', name: 'Supplier A' }),
    resolveTeamById: vi
      .fn()
      .mockResolvedValue({ id: 'team-1', name: 'Team A' }),
    lockTeamForMutation: vi.fn(),
  },
}));

vi.mock('./inspection-issue-responsibility.service', () => ({
  resolveInspectionIssueResponsibility: vi.fn(),
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
  isInspectionSerialNumberConflict: vi.fn().mockReturnValue(false),
}));

describe('inspectionRecordCreateService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveInspectionIssueResponsibility).mockResolvedValue({
      responsibilityType: 'INTERNAL_DEPARTMENT',
      responsibleDepartment: 'Machining BU',
      responsibleDepartmentId: 'dept-machining',
      supplierId: null,
      supplierName: null,
    });
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
      const mockInspection = {
        id: 'insp-1',
        serialNumber: 'INS-001',
        supplierId: 'supplier-1',
        supplierName: 'Supplier A',
        team: null,
        teamId: 'team-1',
      };
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
        teamId: 'team-1',
        unqualifiedQuantity: 0,
        workOrderNumber: 'WO-1',
      } as any);

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(buildGovernedCanonicalWritePairForTable).toHaveBeenCalledWith(
        'inspections',
        expect.objectContaining({ supplierId: undefined }),
      );
      expect(result).toEqual(mockInspection);
      expect(
        MetricRefreshQueue.enqueueSupplierScoresForInspectionIdentities,
      ).toHaveBeenCalledWith(
        expect.any(Object),
        {
          supplierIds: ['supplier-1'],
          teamIds: ['team-1'],
        },
        'inspection.created',
      );
    });

    it('should use a provided transaction client without opening its own transaction', async () => {
      const mockInspection = { id: 'insp-2', serialNumber: 'INS-002' };
      const tx = {
        inspections: {
          create: vi.fn().mockResolvedValue(mockInspection),
          findFirst: vi.fn().mockResolvedValue(null),
        },
      };

      const result = await InspectionRecordCreateService.create(
        {
          category: 'PROCESS',
          inspector: 'Tester',
          inspectionDate: '2026-01-01',
          items: [],
          processName: 'Welding',
          quantity: 10,
          qualifiedQuantity: 10,
          teamId: 'team-1',
          unqualifiedQuantity: 0,
          workOrderNumber: 'WO-1',
        } as any,
        tx as any,
      );

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(tx.inspections.findFirst).toHaveBeenCalled();
      expect(prisma.inspections.findFirst).not.toHaveBeenCalled();
      expect(tx.inspections.create).toHaveBeenCalled();
      expect(result).toEqual(mockInspection);
      expect(
        MetricRefreshQueue.enqueueSupplierScoresForInspectionIdentities,
      ).toHaveBeenCalledWith(
        tx,
        {
          supplierIds: [undefined],
          teamIds: [undefined],
        },
        'inspection.created',
      );
    });

    it('rejects a process inspection without a canonical TEAM identity', async () => {
      await expect(
        InspectionRecordCreateService.create({
          category: 'PROCESS',
          inspector: 'Tester',
          inspectionDate: '2026-01-01',
          items: [],
          processName: 'Welding',
          quantity: 10,
          workOrderNumber: 'WO-1',
        }),
      ).rejects.toMatchObject({ code: 'TEAM_ID_REQUIRED' });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('persists direct internal responsibility without an execution TEAM', async () => {
      const create = vi.fn().mockImplementation(({ data }) => ({
        id: 'insp-direct-internal',
        ...data,
      }));
      (prisma.$transaction as any).mockImplementation(async (callback: any) =>
        callback({ inspections: { create, findFirst: vi.fn() } }),
      );

      await InspectionRecordCreateService.create({
        category: 'PROCESS',
        inspector: 'Tester',
        inspectionDate: '2026-01-01',
        items: [],
        processName: 'Machining',
        quantity: 10,
        responsibilityType: 'INTERNAL_DEPARTMENT',
        responsibleDepartmentId: 'dept-machining',
        workOrderNumber: 'WO-1',
      });

      expect(resolveInspectionIssueResponsibility).toHaveBeenCalledWith(
        {
          responsibilityType: 'INTERNAL_DEPARTMENT',
          responsibleDepartmentId: 'dept-machining',
          supplierId: undefined,
        },
        expect.any(Object),
      );
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            responsibilityType: 'INTERNAL_DEPARTMENT',
            responsibleDepartment: 'Machining BU',
            responsibleDepartmentId: 'dept-machining',
            supplierId: null,
            teamId: null,
          }),
        }),
      );
    });

    it('should generate distinct serial numbers for consecutive creates in one transaction', async () => {
      const createdSerialNumbers: string[] = [];
      const dateStr = new Date().toISOString().slice(0, 10).replaceAll('-', '');
      const tx = {
        inspections: {
          create: vi.fn().mockImplementation(({ data }) => {
            createdSerialNumbers.push(data.serialNumber);
            return { id: `insp-${createdSerialNumbers.length}`, ...data };
          }),
          findFirst: vi.fn().mockImplementation(() => {
            const serialNumber = createdSerialNumbers.at(-1);
            return serialNumber ? { serialNumber } : null;
          }),
        },
      };
      const input = {
        category: 'PROCESS',
        inspector: 'Tester',
        inspectionDate: '2026-01-01',
        items: [],
        processName: 'Welding',
        quantity: 10,
        qualifiedQuantity: 10,
        teamId: 'team-1',
        unqualifiedQuantity: 0,
      } as any;

      await InspectionRecordCreateService.create(
        { ...input, workOrderNumber: 'WO-1' },
        tx as any,
      );
      await InspectionRecordCreateService.create(
        { ...input, workOrderNumber: 'WO-2' },
        tx as any,
      );

      expect(createdSerialNumbers).toEqual([
        `INS-${dateStr}-001`,
        `INS-${dateStr}-002`,
      ]);
      expect(tx.inspections.findFirst).toHaveBeenCalledTimes(2);
      expect(prisma.inspections.findFirst).not.toHaveBeenCalled();
    });

    it('should not retry serial conflicts when a transaction client is provided', async () => {
      const { isInspectionSerialNumberConflict } = await import(
        '~/modules/inspection/inspection-record-types'
      );
      vi.mocked(isInspectionSerialNumberConflict).mockReturnValueOnce(true);
      const conflict = Object.assign(
        new Error(
          'Unique constraint failed on the constraint: `inspections_serialNumber_key`',
        ),
        { code: 'P2002' },
      );
      const tx = {
        inspections: {
          create: vi.fn().mockRejectedValue(conflict),
          findFirst: vi.fn().mockResolvedValue(null),
        },
      };

      await expect(
        InspectionRecordCreateService.create(
          {
            category: 'PROCESS',
            inspector: 'Tester',
            inspectionDate: '2026-01-01',
            items: [],
            processName: 'Welding',
            quantity: 10,
            qualifiedQuantity: 10,
            teamId: 'team-1',
            unqualifiedQuantity: 0,
            workOrderNumber: 'WO-1',
          } as any,
          tx as any,
        ),
      ).rejects.toBe(conflict);
      expect(tx.inspections.create).toHaveBeenCalledTimes(1);
      expect(
        MetricRefreshQueue.enqueueSupplierScoresForInspectionIdentities,
      ).not.toHaveBeenCalled();
    });
  });
});
