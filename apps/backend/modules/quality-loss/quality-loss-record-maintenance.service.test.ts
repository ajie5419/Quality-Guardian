import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DataScopeService } from '~/modules/data-scope/data-scope.service';
import prisma from '~/utils/prisma';

const mocks = vi.hoisted(() => ({ enqueue: vi.fn() }));

vi.mock('~/utils/prisma', () => ({
  default: {
    $transaction: vi.fn(),
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

vi.mock('~/modules/data-scope/data-scope.service', () => ({
  DataScopeService: {
    getDeptCandidates: vi.fn(),
  },
}));

vi.mock('~/modules/system-log/system-log.service', () => ({
  SystemLogService: {
    auditLog: vi.fn(),
  },
}));

vi.mock('./quality-loss-index-queue.service', () => ({
  QualityLossIndexQueue: { enqueue: mocks.enqueue },
}));

describe('quality-loss-record-maintenance.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) =>
      callback({ quality_losses: prisma.quality_losses }),
    );
    vi.mocked(prisma.quality_loss_index.findMany).mockResolvedValue([]);
    vi.mocked(prisma.quality_loss_index.updateMany).mockResolvedValue({
      count: 1,
    });
  });

  it('should delete a record by id', async () => {
    const { QualityLossRecordMaintenanceService } = await import(
      '~/modules/quality-loss/quality-loss-record-maintenance.service'
    );
    (prisma.quality_losses.findFirst as any).mockResolvedValue({ id: 'ql-1' });
    (prisma.quality_losses.updateMany as any).mockResolvedValue({ count: 1 });

    await QualityLossRecordMaintenanceService.deleteRecord('ql-1', {
      userId: 'user-1',
    });

    expect(prisma.quality_losses.updateMany).toHaveBeenCalledWith({
      where: { id: 'ql-1', isDeleted: false },
      data: { isDeleted: true },
    });
    expect(mocks.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ quality_losses: prisma.quality_losses }),
      [{ source: 'MANUAL', sourcePk: 'ql-1' }],
      'quality-loss.deleted',
    );
  });

  it('should delete a record by lossId', async () => {
    const { QualityLossRecordMaintenanceService } = await import(
      '~/modules/quality-loss/quality-loss-record-maintenance.service'
    );
    (prisma.quality_losses.findFirst as any).mockResolvedValue({ id: 'ql-1' });
    (prisma.quality_losses.updateMany as any).mockResolvedValue({ count: 1 });

    await QualityLossRecordMaintenanceService.deleteRecord('QL-2026-001', {
      userId: 'user-1',
    });

    expect(prisma.quality_losses.findFirst).toHaveBeenCalledWith({
      where: {
        isDeleted: false,
        OR: [{ id: 'QL-2026-001' }, { lossId: 'QL-2026-001' }],
      },
      select: { createdBy: true, id: true, respDept: true },
    });
  });

  it('should resolve a materialized manual index id to its source primary key', async () => {
    const { QualityLossRecordMaintenanceService } = await import(
      '~/modules/quality-loss/quality-loss-record-maintenance.service'
    );
    vi.mocked(prisma.quality_loss_index.findMany).mockResolvedValue([
      {
        id: 'QL-cmrirra7i00lyng01jigslrpf',
        source: 'Manual',
        sourcePk: 'cmrirra7i00lyng01jigslrpf',
      },
    ] as never);
    vi.mocked(prisma.quality_losses.findFirst).mockResolvedValue({
      createdBy: 'user-1',
      id: 'cmrirra7i00lyng01jigslrpf',
      respDept: 'QA',
    } as never);
    vi.mocked(prisma.quality_losses.updateMany).mockResolvedValue({
      count: 1,
    });

    await QualityLossRecordMaintenanceService.deleteRecord(
      'QL-cmrirra7i00lyng01jigslrpf',
      { userId: 'user-1' },
    );

    expect(prisma.quality_losses.findFirst).toHaveBeenCalledWith({
      where: {
        isDeleted: false,
        OR: [
          { id: 'cmrirra7i00lyng01jigslrpf' },
          { lossId: 'cmrirra7i00lyng01jigslrpf' },
        ],
      },
      select: { createdBy: true, id: true, respDept: true },
    });
    expect(mocks.enqueue).toHaveBeenCalledWith(
      expect.anything(),
      [{ source: 'MANUAL', sourcePk: 'cmrirra7i00lyng01jigslrpf' }],
      'quality-loss.deleted',
    );
  });

  it('should reject deletion of a source-derived index row', async () => {
    const { QualityLossRecordMaintenanceService } = await import(
      '~/modules/quality-loss/quality-loss-record-maintenance.service'
    );
    vi.mocked(prisma.quality_loss_index.findMany).mockResolvedValue([
      { id: 'EXT-as-1', source: 'External', sourcePk: 'as-1' },
    ] as never);

    await expect(
      QualityLossRecordMaintenanceService.deleteRecord('EXT-as-1', {
        userId: 'user-1',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_SOURCE' });
    expect(prisma.quality_losses.findFirst).not.toHaveBeenCalled();
  });

  it('should enforce self scope before deletion', async () => {
    const { QualityLossRecordMaintenanceService } = await import(
      '~/modules/quality-loss/quality-loss-record-maintenance.service'
    );
    vi.mocked(prisma.quality_losses.findFirst).mockResolvedValue({
      createdBy: 'other-user',
      id: 'ql-1',
      respDept: 'QA',
    } as never);

    await expect(
      QualityLossRecordMaintenanceService.deleteRecord('ql-1', {
        dataScope: { deptIds: [], scopeType: 'SELF' },
        userId: 'user-1',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(prisma.quality_losses.updateMany).not.toHaveBeenCalled();
  });

  it('should enforce department scope before deletion', async () => {
    const { QualityLossRecordMaintenanceService } = await import(
      '~/modules/quality-loss/quality-loss-record-maintenance.service'
    );
    vi.mocked(prisma.quality_losses.findFirst).mockResolvedValue({
      createdBy: 'other-user',
      id: 'ql-1',
      respDept: 'QA',
    } as never);
    vi.mocked(DataScopeService.getDeptCandidates).mockResolvedValue([
      'Production',
    ]);

    await expect(
      QualityLossRecordMaintenanceService.deleteRecord('ql-1', {
        dataScope: { deptIds: ['dept-production'], scopeType: 'DEPT' },
        userId: 'user-1',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('should throw NOT_FOUND when record does not exist', async () => {
    const { QualityLossRecordMaintenanceService } = await import(
      '~/modules/quality-loss/quality-loss-record-maintenance.service'
    );
    (prisma.quality_losses.findFirst as any).mockResolvedValue(null);

    await expect(
      QualityLossRecordMaintenanceService.deleteRecord('missing', {
        userId: 'user-1',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('should batch delete with deduplicated ids', async () => {
    const { QualityLossRecordMaintenanceService } = await import(
      '~/modules/quality-loss/quality-loss-record-maintenance.service'
    );
    (prisma.quality_losses.findMany as any).mockResolvedValue([
      { id: 'ql-1' },
      { id: 'ql-2' },
    ]);
    (prisma.quality_losses.updateMany as any).mockResolvedValue({ count: 2 });

    const result = await QualityLossRecordMaintenanceService.batchDelete(
      ['ql-1', 'ql-2', 'ql-1', ' '],
      { userId: 'user-1' },
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
      select: { createdBy: true, id: true, respDept: true },
    });
  });

  it('should return count 0 for empty ids', async () => {
    const { QualityLossRecordMaintenanceService } = await import(
      '~/modules/quality-loss/quality-loss-record-maintenance.service'
    );

    const result = await QualityLossRecordMaintenanceService.batchDelete([], {
      userId: 'user-1',
    });

    expect(result).toEqual({ count: 0 });
  });

  it('should return count 0 when no targets found', async () => {
    const { QualityLossRecordMaintenanceService } = await import(
      '~/modules/quality-loss/quality-loss-record-maintenance.service'
    );
    (prisma.quality_losses.findMany as any).mockResolvedValue([]);

    const result = await QualityLossRecordMaintenanceService.batchDelete(
      ['missing-id'],
      { userId: 'user-1' },
    );

    expect(result).toEqual({ count: 0 });
  });

  it('should return drill-down rows from quality_loss_index', async () => {
    const { QualityLossRecordMaintenanceService } = await import(
      '~/modules/quality-loss/quality-loss-record-maintenance.service'
    );
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
