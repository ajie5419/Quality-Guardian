import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('~/utils/prisma', () => ({
  default: {
    quality_loss_index: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    quality_losses: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

vi.mock('~/modules/quality-loss/quality-loss-index.service', () => ({
  QualityLossIndexService: {
    softDeleteSource: vi.fn(),
    softDeleteSourceMany: vi.fn(),
  },
}));

vi.mock('~/modules/system-log/system-log.service', () => ({
  SystemLogService: {
    auditLog: vi.fn(),
  },
}));

describe('quality-loss-record-maintenance.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should delete a record by id', async () => {
    const { QualityLossRecordMaintenanceService } = await import(
      '~/modules/quality-loss/quality-loss-record-maintenance.service'
    );
    const prismaModule = await import('~/utils/prisma');
    const prisma = prismaModule.default;

    (prisma.quality_losses.findFirst as any).mockResolvedValue({ id: 'ql-1' });
    (prisma.quality_losses.update as any).mockResolvedValue({});

    await QualityLossRecordMaintenanceService.deleteRecord('ql-1', 'user-1');

    expect(prisma.quality_losses.update).toHaveBeenCalledWith({
      where: { id: 'ql-1' },
      data: { isDeleted: true },
    });
  });

  it('should delete a record by lossId', async () => {
    const { QualityLossRecordMaintenanceService } = await import(
      '~/modules/quality-loss/quality-loss-record-maintenance.service'
    );
    const prismaModule = await import('~/utils/prisma');
    const prisma = prismaModule.default;

    (prisma.quality_losses.findFirst as any).mockResolvedValue({ id: 'ql-1' });
    (prisma.quality_losses.update as any).mockResolvedValue({});

    await QualityLossRecordMaintenanceService.deleteRecord(
      'QL-2026-001',
      'user-1',
    );

    expect(prisma.quality_losses.findFirst).toHaveBeenCalledWith({
      where: {
        isDeleted: false,
        OR: [{ id: 'QL-2026-001' }, { lossId: 'QL-2026-001' }],
      },
      select: { id: true },
    });
  });

  it('should throw NOT_FOUND when record does not exist', async () => {
    const { QualityLossRecordMaintenanceService } = await import(
      '~/modules/quality-loss/quality-loss-record-maintenance.service'
    );
    const prismaModule = await import('~/utils/prisma');
    const prisma = prismaModule.default;

    (prisma.quality_losses.findFirst as any).mockResolvedValue(null);

    await expect(
      QualityLossRecordMaintenanceService.deleteRecord('missing', 'user-1'),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('should batch delete with deduplicated ids', async () => {
    const { QualityLossRecordMaintenanceService } = await import(
      '~/modules/quality-loss/quality-loss-record-maintenance.service'
    );
    const prismaModule = await import('~/utils/prisma');
    const prisma = prismaModule.default;

    (prisma.quality_losses.findMany as any).mockResolvedValue([
      { id: 'ql-1' },
      { id: 'ql-2' },
    ]);
    (prisma.quality_losses.updateMany as any).mockResolvedValue({ count: 2 });

    const result = await QualityLossRecordMaintenanceService.batchDelete(
      ['ql-1', 'ql-2', 'ql-1', ' '],
      'user-1',
    );

    expect(result).toEqual({ count: 2 });
    expect(prisma.quality_losses.findMany).toHaveBeenCalledWith({
      where: {
        isDeleted: false,
        OR: [
          { id: { in: ['ql-1', 'ql-2'] } },
          { lossId: { in: ['ql-1', 'ql-2'] } },
        ],
      },
      select: { id: true },
    });
  });

  it('should return count 0 for empty ids', async () => {
    const { QualityLossRecordMaintenanceService } = await import(
      '~/modules/quality-loss/quality-loss-record-maintenance.service'
    );

    const result = await QualityLossRecordMaintenanceService.batchDelete(
      [],
      'user-1',
    );

    expect(result).toEqual({ count: 0 });
  });

  it('should return count 0 when no targets found', async () => {
    const { QualityLossRecordMaintenanceService } = await import(
      '~/modules/quality-loss/quality-loss-record-maintenance.service'
    );
    const prismaModule = await import('~/utils/prisma');
    const prisma = prismaModule.default;

    (prisma.quality_losses.findMany as any).mockResolvedValue([]);

    const result = await QualityLossRecordMaintenanceService.batchDelete(
      ['missing-id'],
      'user-1',
    );

    expect(result).toEqual({ count: 0 });
  });

  it('should return drill-down rows from quality_loss_index', async () => {
    const { QualityLossRecordMaintenanceService } = await import(
      '~/modules/quality-loss/quality-loss-record-maintenance.service'
    );
    const prismaModule = await import('~/utils/prisma');
    const prisma = prismaModule.default;

    (prisma.quality_loss_index.findMany as any).mockResolvedValue([
      { id: 'EXT-as-1', source: 'External', amount: 100 },
      { id: 'INT-qr-1', source: 'Internal', amount: 50 },
    ]);

    const result = await QualityLossRecordMaintenanceService.getDrillDown(
      new Date('2026-01-01'),
      new Date('2026-01-31'),
    );

    expect(prisma.quality_loss_index.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isDeleted: false }),
        orderBy: { occurDate: 'desc' },
      }),
    );
    expect(result).toEqual([
      { id: 'EXT-as-1', source: 'External', amount: 100 },
      { id: 'INT-qr-1', source: 'Internal', amount: 50 },
    ]);
  });
});
