import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '~/utils/prisma';

import { backfillInspectionRequestSupplierIdentities } from './backfill-inspection-request-supplier-identities';
import { persistResolutionAudit } from './supplier-identity-backfill-runtime';

vi.mock('~/utils/prisma', () => ({
  default: {
    qms_inspection_requests: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock('./supplier-identity-backfill-runtime', () => ({
  persistResolutionAudit: vi.fn(),
}));

vi.mock('~/utils/logger', () => ({
  createModuleLogger: vi.fn().mockReturnValue({ info: vi.fn() }),
}));

const options = {
  batchSize: 100,
  maxBatches: 0,
  mode: 'apply' as const,
};

describe('inspection request supplier identity backfill', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('backfills a unique incoming supplier identity and snapshot', async () => {
    vi.mocked(prisma.qms_inspection_requests.findMany)
      .mockResolvedValueOnce([
        {
          id: 'request-1',
          inspection: null,
          requestNo: 'IR-1',
          supplierId: null,
          team: 'Supplier A',
        },
      ] as never)
      .mockResolvedValueOnce([]);
    vi.mocked(prisma.qms_inspection_requests.updateMany).mockResolvedValue({
      count: 1,
    });
    vi.mocked(prisma.$transaction).mockResolvedValue([{ count: 1 }] as never);

    await expect(
      backfillInspectionRequestSupplierIdentities(options, {
        supplierById: new Map(),
        supplierByName: new Map([
          ['Supplier A', { id: 'supplier-1', name: 'Supplier A' }],
        ]),
      }),
    ).resolves.toMatchObject({ updated: 1, unresolved: 0 });
    expect(prisma.qms_inspection_requests.updateMany).toHaveBeenCalledWith({
      where: { id: 'request-1', isDeleted: false, supplierId: null },
      data: { supplierId: 'supplier-1', team: 'Supplier A' },
    });
  });

  it('persists unresolved evidence instead of guessing unknown suppliers', async () => {
    vi.mocked(prisma.qms_inspection_requests.findMany)
      .mockResolvedValueOnce([
        {
          id: 'request-2',
          inspection: null,
          requestNo: 'IR-2',
          supplierId: null,
          team: 'Unknown Supplier',
        },
      ] as never)
      .mockResolvedValueOnce([]);

    await expect(
      backfillInspectionRequestSupplierIdentities(options, {
        supplierById: new Map(),
        supplierByName: new Map(),
      }),
    ).resolves.toMatchObject({ updated: 0, unresolved: 1 });
    expect(persistResolutionAudit).toHaveBeenCalledWith({
      entityType: 'qms_inspection_requests',
      resolved: [],
      unresolved: [
        expect.objectContaining({
          entityId: 'request-2',
          reason: 'supplier_identity_not_resolved',
        }),
      ],
    });
  });

  it('preserves a valid existing ID when linked evidence conflicts', async () => {
    vi.mocked(prisma.qms_inspection_requests.findMany)
      .mockResolvedValueOnce([
        {
          id: 'request-3',
          inspection: { supplierId: 'supplier-2' },
          requestNo: 'IR-3',
          supplierId: 'supplier-1',
          team: 'Supplier B',
        },
      ] as never)
      .mockResolvedValueOnce([]);

    await expect(
      backfillInspectionRequestSupplierIdentities(options, {
        supplierById: new Map([
          ['supplier-1', { id: 'supplier-1', name: 'Supplier A' }],
          ['supplier-2', { id: 'supplier-2', name: 'Supplier B' }],
        ]),
        supplierByName: new Map([
          ['Supplier B', { id: 'supplier-2', name: 'Supplier B' }],
        ]),
      }),
    ).resolves.toMatchObject({ updated: 0, unresolved: 1 });
    expect(prisma.qms_inspection_requests.updateMany).not.toHaveBeenCalled();
    expect(persistResolutionAudit).toHaveBeenCalledWith({
      entityType: 'qms_inspection_requests',
      resolved: [],
      unresolved: [
        expect.objectContaining({
          entityId: 'request-3',
          reason: 'supplier_identity_conflict',
        }),
      ],
    });
  });
});
