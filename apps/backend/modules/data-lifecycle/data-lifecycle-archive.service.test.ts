import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '~/utils/prisma';

import { runLifecycleArchive } from './data-lifecycle-archive.service';

vi.mock('~/utils/prisma', () => ({
  default: {
    data_retention_rules: { findUnique: vi.fn(), findMany: vi.fn() },
    quality_records: { updateMany: vi.fn() },
    inspections: { updateMany: vi.fn() },
    qms_inspection_requests: { updateMany: vi.fn() },
    measuring_instruments: { updateMany: vi.fn() },
    after_sales: { updateMany: vi.fn() },
    quality_losses: { updateMany: vi.fn() },
    work_orders: { updateMany: vi.fn() },
    quality_loss_index: { deleteMany: vi.fn() },
    supplier_score_snapshots: { deleteMany: vi.fn() },
  },
}));

describe('data lifecycle archive', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.data_retention_rules.findMany).mockResolvedValue([
      { dataClass: 'inspection-record', retentionDays: 3650 },
      { dataClass: 'inspection', retentionDays: 3650 },
      { dataClass: 'inspection-request', retentionDays: 3650 },
      { dataClass: 'metrology', retentionDays: 3650 },
      { dataClass: 'after-sales', retentionDays: 3650 },
      { dataClass: 'quality-loss', retentionDays: 3650 },
      { dataClass: 'work-order', retentionDays: 3650 },
    ] as never);
    vi.mocked(prisma.data_retention_rules.findUnique).mockResolvedValue({
      retentionDays: 730,
    } as never);
  });

  it('marks expired business rows with archivedAt', async () => {
    for (const table of [
      'quality_records',
      'inspections',
      'qms_inspection_requests',
      'measuring_instruments',
      'after_sales',
      'quality_losses',
      'work_orders',
    ]) {
      vi.mocked((prisma as any)[table].updateMany).mockResolvedValue({
        count: 0,
      } as never);
    }
    vi.mocked(prisma.quality_records.updateMany).mockResolvedValue({
      count: 3,
    } as never);
    vi.mocked(prisma.quality_loss_index.deleteMany).mockResolvedValue({
      count: 0,
    } as never);
    vi.mocked(prisma.supplier_score_snapshots.deleteMany).mockResolvedValue({
      count: 0,
    } as never);

    const now = new Date('2026-08-17T02:00:00.000Z');
    const result = await runLifecycleArchive(now);

    expect(prisma.quality_records.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        archivedAt: null,
        isDeleted: false,
        OR: expect.any(Array),
      }),
      data: { archivedAt: now },
    });
    // 兜底推算：OR 含 createdAt 超规则天数的分支
    const where = vi.mocked(prisma.quality_records.updateMany).mock
      .calls[0]?.[0]?.where as { OR: unknown[] };
    expect(where.OR).toHaveLength(2);
    expect(result.archived).toBe(3);
  });

  it('purges snapshots older than the retention cutoff', async () => {
    for (const table of [
      'quality_records',
      'inspections',
      'qms_inspection_requests',
      'measuring_instruments',
      'after_sales',
      'quality_losses',
      'work_orders',
    ]) {
      vi.mocked((prisma as any)[table].updateMany).mockResolvedValue({
        count: 0,
      } as never);
    }
    vi.mocked(prisma.quality_loss_index.deleteMany).mockResolvedValue({
      count: 5,
    } as never);
    vi.mocked(prisma.supplier_score_snapshots.deleteMany).mockResolvedValue({
      count: 0,
    } as never);

    const now = new Date('2026-08-17T02:00:00.000Z');
    const cutoff = new Date(now.getTime() - 730 * 24 * 60 * 60 * 1000);
    const result = await runLifecycleArchive(now);

    expect(prisma.quality_loss_index.deleteMany).toHaveBeenCalledWith({
      where: { indexedAt: { lt: cutoff }, isDeleted: false },
    });
    expect(result.deletedSnapshots).toBe(5);
  });
});
