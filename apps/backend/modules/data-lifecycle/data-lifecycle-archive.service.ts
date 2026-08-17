import { createModuleLogger } from '~/utils/logger';
import prisma from '~/utils/prisma';

const logger = createModuleLogger('DataLifecycleJob');

/**
 * 10 年保留期数据类的归档来源（与 data_retention_rules 的 dataClass 对应）。
 */
export const ARCHIVE_SOURCES = [
  { dataClass: 'inspection-record', source: 'quality_records' },
  { dataClass: 'inspection', source: 'inspections' },
  { dataClass: 'inspection-request', source: 'qms_inspection_requests' },
  { dataClass: 'metrology', source: 'measuring_instruments' },
  { dataClass: 'after-sales', source: 'after_sales' },
  { dataClass: 'quality-loss', source: 'quality_losses' },
  { dataClass: 'work-order', source: 'work_orders' },
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
 * 扫描并归档到期数据（数据生命周期 P3，方案 B 全覆盖）。
 * - ARCHIVE：7 类业务表——retainUntil 到期（显式标签）或 retainUntil 为空但
 *   createdAt 已超规则天数（兜底推算，覆盖存量无标签数据）→ 打 archivedAt 标记
 * - DELETE（快照）：物化表超期 → 物理删除（可重建）
 * 幂等：只处理到期行；快照删除按日期批量。
 */
export async function runLifecycleArchive(now = new Date()): Promise<{
  archived: number;
  deletedSnapshots: number;
}> {
  let archived = 0;
  let deletedSnapshots = 0;

  // 1. 读取全部保留期规则（map by dataClass）
  const rules = await prisma.data_retention_rules.findMany({
    where: { isDeleted: false, isEnabled: true },
    select: { dataClass: true, retentionDays: true },
  });
  const daysByClass = new Map(
    rules.map((rule) => [rule.dataClass, rule.retentionDays]),
  );

  // 2. ARCHIVE: 显式标签到期 或 无标签但创建时间超规则天数（兜底推算）。
  // 每类一个显式调用保持类型安全（B-T1）；共享 where/data 结构。
  const fallbackCutoffOf = (dataClass: string) => {
    const days = daysByClass.get(dataClass) ?? 3650;
    return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  };
  const archiveWhere = (cutoff: Date) => ({
    archivedAt: null,
    isDeleted: false,
    OR: [
      { retainUntil: { not: null, lt: now } },
      { retainUntil: null, createdAt: { lt: cutoff } },
    ],
  });
  const archiveData = { archivedAt: now };

  const archiveRuns = [
    {
      source: 'quality_records',
      run: prisma.quality_records.updateMany({
        where: archiveWhere(fallbackCutoffOf('inspection-record')),
        data: archiveData,
      }),
    },
    {
      source: 'inspections',
      run: prisma.inspections.updateMany({
        where: archiveWhere(fallbackCutoffOf('inspection')),
        data: archiveData,
      }),
    },
    {
      source: 'qms_inspection_requests',
      run: prisma.qms_inspection_requests.updateMany({
        where: archiveWhere(fallbackCutoffOf('inspection-request')),
        data: archiveData,
      }),
    },
    {
      source: 'measuring_instruments',
      run: prisma.measuring_instruments.updateMany({
        where: archiveWhere(fallbackCutoffOf('metrology')),
        data: archiveData,
      }),
    },
    {
      source: 'after_sales',
      run: prisma.after_sales.updateMany({
        where: archiveWhere(fallbackCutoffOf('after-sales')),
        data: archiveData,
      }),
    },
    {
      source: 'quality_losses',
      run: prisma.quality_losses.updateMany({
        where: archiveWhere(fallbackCutoffOf('quality-loss')),
        data: archiveData,
      }),
    },
    {
      source: 'work_orders',
      run: prisma.work_orders.updateMany({
        where: archiveWhere(fallbackCutoffOf('work-order')),
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

  // 3. DELETE: purge expired snapshots (rebuildable materialized data).
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
