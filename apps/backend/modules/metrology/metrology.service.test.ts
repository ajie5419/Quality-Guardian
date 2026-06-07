import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MetrologyImportService } from '~/modules/metrology/metrology-import.service';
import { MetrologyService } from '~/modules/metrology/metrology.service';
import prisma from '~/utils/prisma';

vi.mock('~/utils/prisma', () => ({
  default: {
    measuring_instruments: {
      count: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

vi.mock('~/utils/governed-write', () => ({
  buildGovernedWriteFieldsForTable: () => ({ canonicalNameId: 'canon-1' }),
}));

vi.mock('~/modules/metrology/metrology-import.service', () => ({
  MetrologyImportService: {
    importItems: vi.fn(),
  },
}));

const baseInstrument = {
  borrowStatus: 'AVAILABLE',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  id: 'm-1',
  inspectionStatus: 'VALID',
  instrumentCode: 'M-001',
  instrumentName: 'Torque Wrench',
  model: 'TW-1',
  orderNo: 1,
  sourceFileName: null,
  updatedAt: new Date('2026-01-02T00:00:00.000Z'),
  usingUnit: 'QA',
  validUntil: new Date('2099-01-01T00:00:00.000Z'),
};

describe('metrologyService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('builds paged query with filters, status condition, and pageSize cap', async () => {
    vi.mocked(prisma.measuring_instruments.findMany).mockResolvedValue([
      baseInstrument,
    ] as never);
    vi.mocked(prisma.measuring_instruments.count).mockResolvedValue(1 as never);

    const result = await MetrologyService.getList({
      inspectionStatus: 'expired',
      keyword: 'wrench',
      page: 2,
      pageSize: 500,
      sortBy: 'validUntil',
      sortOrder: 'desc',
      usingUnit: 'QA',
    });

    expect(result.total).toBe(1);
    expect(result.items[0]).toEqual(
      expect.objectContaining({
        id: 'm-1',
        instrumentCode: 'M-001',
        instrumentName: 'Torque Wrench',
      }),
    );
    expect(prisma.measuring_instruments.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ validUntil: 'desc' }, { createdAt: 'desc' }],
        skip: 100,
        take: 100,
        where: expect.objectContaining({
          isDeleted: false,
          usingUnit: { contains: 'QA' },
        }),
      }),
    );
    const where = vi.mocked(prisma.measuring_instruments.findMany).mock
      .calls[0]?.[0].where as any;
    expect(where.AND).toEqual(expect.any(Array));
    expect(where.OR).toEqual(expect.any(Array));
  });

  it('summarizes overview statuses from derived inspection state', async () => {
    const now = new Date();
    const expired = new Date('2000-01-01T00:00:00.000Z');
    const pending = new Date(now);
    pending.setDate(pending.getDate() + 10);
    const valid = new Date(now);
    valid.setDate(valid.getDate() + 60);
    vi.mocked(prisma.measuring_instruments.findMany).mockResolvedValue([
      { ...baseInstrument, id: 'disabled', inspectionStatus: 'DISABLED' },
      {
        ...baseInstrument,
        id: 'expired',
        inspectionStatus: '',
        validUntil: expired,
      },
      {
        ...baseInstrument,
        id: 'pending',
        inspectionStatus: '',
        validUntil: pending,
      },
      {
        ...baseInstrument,
        id: 'valid',
        inspectionStatus: '',
        validUntil: valid,
      },
    ] as never);

    const result = await MetrologyService.getOverview({});

    expect(result).toEqual({
      disabledCount: 1,
      expiredCount: 1,
      expiringSoonCount: 1,
      totalCount: 4,
      validCount: 1,
    });
  });

  it('normalizes mutation payload and rejects invalid dates', async () => {
    expect(
      MetrologyService.buildMutationPayload({
        instrumentCode: ' M-002 ',
        instrumentName: ' Gauge ',
        orderNo: '12',
        validUntil: '2026-12-31',
      }),
    ).toEqual(
      expect.objectContaining({
        canonicalNameId: 'canon-1',
        instrumentCode: 'M-002',
        instrumentName: 'Gauge',
        orderNo: 12,
      }),
    );

    expect(() =>
      MetrologyService.buildMutationPayload({
        instrumentCode: 'M-003',
        instrumentName: 'Gauge',
        validUntil: 'not-a-date',
      }),
    ).toThrow('有效期格式无效');
  });

  it('creates, updates, and soft deletes instruments with normalized payload', async () => {
    vi.mocked(prisma.measuring_instruments.create).mockResolvedValue({
      id: 'm-1',
    } as never);
    vi.mocked(prisma.measuring_instruments.update).mockResolvedValue({
      id: 'm-1',
    } as never);

    await MetrologyService.create(
      {
        instrumentCode: 'M-001',
        instrumentName: 'Gauge',
        validUntil: '2026-12-31',
      },
      'admin',
    );
    await MetrologyService.updateById(
      'm-1',
      {
        instrumentCode: 'M-002',
        instrumentName: 'Gauge 2',
      },
      'admin',
    );
    await MetrologyService.deleteById('m-1', 'admin');

    expect(prisma.measuring_instruments.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        createdBy: 'admin',
        instrumentCode: 'M-001',
        instrumentName: 'Gauge',
        updatedBy: 'admin',
      }),
    });
    expect(prisma.measuring_instruments.update).toHaveBeenCalledWith({
      where: { id: 'm-1' },
      data: expect.objectContaining({
        instrumentCode: 'M-002',
        instrumentName: 'Gauge 2',
        updatedBy: 'admin',
      }),
    });
    expect(prisma.measuring_instruments.update).toHaveBeenCalledWith({
      where: { id: 'm-1' },
      data: {
        isDeleted: true,
        updatedAt: expect.any(Date),
        updatedBy: 'admin',
      },
    });
  });

  it('batch deletes active instruments only', async () => {
    vi.mocked(prisma.measuring_instruments.updateMany).mockResolvedValue({
      count: 2,
    } as never);

    await MetrologyService.batchDelete(['m-1', 'm-2'], 'admin');

    expect(prisma.measuring_instruments.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['m-1', 'm-2'] }, isDeleted: false },
      data: {
        isDeleted: true,
        updatedAt: expect.any(Date),
        updatedBy: 'admin',
      },
    });
  });

  it('exports full list without pagination and delegates imports/templates', async () => {
    vi.mocked(prisma.measuring_instruments.findMany).mockResolvedValue([
      baseInstrument,
    ] as never);
    vi.mocked(MetrologyImportService.importItems).mockResolvedValue({
      successCount: 1,
    } as never);

    const exportList = await MetrologyService.getExportList({
      sortBy: 'orderNo',
      sortOrder: 'asc',
    });
    const importResult = await MetrologyService.importItems(
      [{ instrumentName: 'Gauge' }],
      'admin',
      'file.xlsx',
    );
    const templateRows = MetrologyService.getTemplateRows();

    expect(exportList.total).toBe(1);
    expect(prisma.measuring_instruments.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ orderNo: 'asc' }, { createdAt: 'desc' }],
      }),
    );
    expect(importResult).toEqual({ successCount: 1 });
    expect(MetrologyImportService.importItems).toHaveBeenCalledWith(
      [{ instrumentName: 'Gauge' }],
      'admin',
      'file.xlsx',
    );
    expect(templateRows.length).toBeGreaterThan(0);
  });
});
