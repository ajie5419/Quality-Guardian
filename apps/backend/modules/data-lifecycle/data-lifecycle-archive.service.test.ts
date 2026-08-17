import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '~/utils/prisma';

import { runLifecycleArchive } from './data-lifecycle-archive.service';

vi.mock('~/utils/prisma', () => ({
  default: {
    data_retention_rules: { findUnique: vi.fn() },
    quality_records: { updateMany: vi.fn() },
    inspections: { updateMany: vi.fn() },
    qms_inspection_requests: { updateMany: vi.fn() },
    quality_loss_index: { deleteMany: vi.fn() },
    supplier_score_snapshots: { deleteMany: vi.fn() },
  },
}));

describe('data lifecycle archive', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.data_retention_rules.findUnique).mockResolvedValue({
      retentionDays: 730,
    } as never);
  });

  it('marks expired business rows with archivedAt', async () => {
    vi.mocked(prisma.quality_records.updateMany).mockResolvedValue({
      count: 3,
    } as never);
    vi.mocked(prisma.inspections.updateMany).mockResolvedValue({
      count: 0,
    } as never);
    vi.mocked(prisma.qms_inspection_requests.updateMany).mockResolvedValue({
      count: 0,
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
      where: {
        archivedAt: null,
        retainUntil: { not: null, lt: now },
        isDeleted: false,
      },
      data: { archivedAt: now },
    });
    expect(result.archived).toBe(3);
  });

  it('purges snapshots older than the retention cutoff', async () => {
    vi.mocked(prisma.quality_records.updateMany).mockResolvedValue({
      count: 0,
    } as never);
    vi.mocked(prisma.inspections.updateMany).mockResolvedValue({
      count: 0,
    } as never);
    vi.mocked(prisma.qms_inspection_requests.updateMany).mockResolvedValue({
      count: 0,
    } as never);
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
