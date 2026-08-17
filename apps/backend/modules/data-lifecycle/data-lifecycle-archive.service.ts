import { createModuleLogger } from '~/utils/logger';
import prisma from '~/utils/prisma';

const logger = createModuleLogger('DataLifecycleJob');

export const ARCHIVE_TABLES = [
  { table: 'quality_records', source: 'quality_records' },
  { table: 'inspections', source: 'inspections' },
  { table: 'qms_inspection_requests', source: 'qms_inspection_requests' },
] as const;

export const SNAPSHOT_TABLES = [
  {
    table: 'quality_loss_index',
    source: 'quality_loss_index',
    dateColumn: 'indexedAt',
  },
  {
    table: 'supplier_score_snapshots',
    source: 'supplier_score_snapshots',
    dateColumn: 'createdAt',
  },
] as const;

/**
 * 扫描并归档到期数据（数据生命周期 P3）。
 * - ARCHIVE：业务表 retainUntil 到期且未归档 → 打 archivedAt 标记（只读阶段）
 * - DELETE（快照）：物化表超期 → 物理删除（可重建）
 * 幂等：只处理 retainUntil 已到期的行；快照删除按日期批量。
 */
export async function runLifecycleArchive(now = new Date()): Promise<{
  archived: number;
  deletedSnapshots: number;
}> {
  let archived = 0;
  let deletedSnapshots = 0;

  // 1. ARCHIVE: mark expired business rows (retainUntil set and due).
  // Explicit per-table calls keep the Prisma delegates type-safe (B-T1).
  const archiveWhere = {
    archivedAt: null,
    retainUntil: { not: null, lt: now },
    isDeleted: false,
  } as const;
  const archiveData = { archivedAt: now };
  const archiveRuns = [
    {
      source: 'quality_records',
      run: prisma.quality_records.updateMany({
        where: archiveWhere,
        data: archiveData,
      }),
    },
    {
      source: 'inspections',
      run: prisma.inspections.updateMany({
        where: archiveWhere,
        data: archiveData,
      }),
    },
    {
      source: 'qms_inspection_requests',
      run: prisma.qms_inspection_requests.updateMany({
        where: archiveWhere,
        data: archiveData,
      }),
    },
  ];
  const archiveResults = await Promise.all(
    archiveRuns.map((entry) => entry.run),
  );
  archiveRuns.forEach((entry, index) => {
    const count = archiveResults[index]?.count ?? 0;
    archived += count;
    if (count > 0) {
      logger.info({ source: entry.source, count }, 'lifecycle archive marked');
    }
  });
  // 2. DELETE: purge expired snapshots (rebuildable materialized data).
  // Cutoff comes from the retention rules table (dataClass=snapshot, 730d).
  const snapshotRule = await prisma.data_retention_rules.findUnique({
    where: { dataClass: 'snapshot' },
    select: { retentionDays: true },
  });
  const snapshotCutoff = new Date(
    now.getTime() - (snapshotRule?.retentionDays ?? 730) * 24 * 60 * 60 * 1000,
  );
  const snapshotRuns = [
    {
      source: 'quality_loss_index',
      run: prisma.quality_loss_index.deleteMany({
        where: { indexedAt: { lt: snapshotCutoff }, isDeleted: false },
      }),
    },
    {
      source: 'supplier_score_snapshots',
      run: prisma.supplier_score_snapshots.deleteMany({
        where: { createdAt: { lt: snapshotCutoff }, isDeleted: false },
      }),
    },
  ];
  const snapshotResults = await Promise.all(
    snapshotRuns.map((entry) => entry.run),
  );
  snapshotRuns.forEach((entry, index) => {
    const count = snapshotResults[index]?.count ?? 0;
    deletedSnapshots += count;
    if (count > 0) {
      logger.info(
        { source: entry.source, count, cutoff: snapshotCutoff.toISOString() },
        'lifecycle snapshot purged',
      );
    }
  });

  return { archived, deletedSnapshots };
}
