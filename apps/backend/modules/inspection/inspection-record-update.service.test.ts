import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InspectionRecordUpdateService } from '~/modules/inspection/inspection-record-update.service';
import { eventBus } from '~/utils/event-bus';
import prisma from '~/utils/prisma';

vi.mock('~/utils/prisma', () => ({
  default: {
    $transaction: vi.fn(),
  },
}));

vi.mock('~/utils/event-bus', () => ({
  eventBus: { emit: vi.fn() },
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

vi.mock('~/modules/supplier-identity', () => ({
  SupplierIdentityService: {
    resolveSupplierForInspection: vi
      .fn()
      .mockResolvedValue({ id: 'supplier-2', name: 'Supplier B' }),
  },
}));

vi.mock('~/modules/file-storage/file-storage.service', () => ({
  FileStorageService: {
    registerReferencesFromAttachments: vi.fn(),
  },
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
  normalizeOptionalString: vi.fn().mockImplementation((v) => v ?? null),
}));

describe('inspectionRecordUpdateService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should update inspection record', async () => {
    const mockInspection = {
      id: 'i-1',
      processId: 'process-1',
      processName: 'Welding',
      documents: null,
      supplierId: 'supplier-2',
      supplierName: 'Supplier B',
      team: 'Team B',
      teamId: 'team-2',
      workOrderNumber: 'WO-1',
    };
    const txInspectionsUpdate = vi.fn().mockResolvedValue(mockInspection);
    (prisma.$transaction as any).mockImplementation(async (cb: any) =>
      cb({
        inspections: {
          findUnique: vi.fn().mockResolvedValue({
            category: 'PROCESS',
            incomingType: null,
            processId: 'process-old',
            processName: 'Old',
            supplierName: 'Supplier A',
            supplierId: 'supplier-1',
            team: 'Team A',
            teamId: 'team-1',
            templateId: null,
            templateName: null,
            workOrderNumber: 'WO-1',
          }),
          update: txInspectionsUpdate,
        },
        inspection_items: {
          deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
          createMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
      }),
    );

    const result = await InspectionRecordUpdateService.update('i-1', {
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
    expect(eventBus.emit).toHaveBeenCalledWith('inspection_record.changed', {
      supplierIds: ['supplier-1', 'supplier-2'],
      supplierNames: ['Supplier A', 'Supplier B'],
      teamIds: ['team-1', 'team-2'],
      teamNames: ['Team A', 'Team B'],
    });
  });

  it('should replace items (delete old, create new)', async () => {
    const txDeleteMany = vi.fn().mockResolvedValue({ count: 2 });
    const txCreateMany = vi.fn().mockResolvedValue({ count: 2 });
    (prisma.$transaction as any).mockImplementation(async (cb: any) =>
      cb({
        inspections: {
          findUnique: vi.fn().mockResolvedValue({
            category: 'PROCESS',
            incomingType: null,
            processId: null,
            processName: null,
            templateId: null,
            templateName: null,
            workOrderNumber: 'WO-1',
          }),
          update: vi.fn().mockResolvedValue({
            id: 'i-1',
            documents: null,
            workOrderNumber: 'WO-1',
          }),
        },
        inspection_items: {
          deleteMany: txDeleteMany,
          createMany: txCreateMany,
        },
      }),
    );

    await InspectionRecordUpdateService.update('i-1', {
      category: 'PROCESS',
      items: [{ checkItem: 'Visually', result: 'PASS', order: 1 }],
      processName: 'Welding',
      quantity: 5,
      qualifiedQuantity: 5,
      unqualifiedQuantity: 0,
      workOrderNumber: 'WO-1',
    } as any);

    expect(txDeleteMany).toHaveBeenCalledWith({
      where: { inspectionId: 'i-1' },
    });
    expect(txCreateMany).toHaveBeenCalled();
  });

  it('should call syncInspectionProjectDocuments', async () => {
    const { syncInspectionProjectDocuments } = await import(
      '~/modules/inspection/inspection-project-document-sync.service'
    );
    (prisma.$transaction as any).mockImplementation(async (cb: any) =>
      cb({
        inspections: {
          findUnique: vi.fn().mockResolvedValue({
            category: 'PROCESS',
            incomingType: null,
            processId: null,
            processName: null,
            templateId: null,
            templateName: null,
            workOrderNumber: 'WO-1',
          }),
          update: vi.fn().mockResolvedValue({
            id: 'i-1',
            processId: 'process-1',
            processName: 'Welding',
            documents: null,
            workOrderNumber: 'WO-1',
          }),
        },
        inspection_items: {
          deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
          createMany: vi.fn(),
        },
      }),
    );

    await InspectionRecordUpdateService.update('i-1', {
      category: 'PROCESS',
      items: [],
      processName: 'Welding',
      quantity: 1,
      qualifiedQuantity: 1,
      unqualifiedQuantity: 0,
      workOrderNumber: 'WO-1',
    } as any);

    expect(syncInspectionProjectDocuments).toHaveBeenCalled();
  });

  it('does not publish a change event when the transaction rolls back', async () => {
    const failure = new Error('transaction failed');
    vi.mocked(prisma.$transaction).mockRejectedValue(failure);

    await expect(
      InspectionRecordUpdateService.update('i-1', {
        category: 'PROCESS',
        items: [],
        processName: 'Welding',
        quantity: 1,
        qualifiedQuantity: 1,
        unqualifiedQuantity: 0,
        workOrderNumber: 'WO-1',
      } as any),
    ).rejects.toBe(failure);

    expect(eventBus.emit).not.toHaveBeenCalled();
  });
});
