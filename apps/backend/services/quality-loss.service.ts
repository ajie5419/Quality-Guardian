import prisma from '~/utils/prisma';

// 常量定义
const QL_CONSTANTS = {
  MONTHS: [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ],
  STATUS: {
    CLOSED: 'CLOSED',
    CONFIRMED: 'Confirmed',
    PENDING: 'Pending',
  },
  SOURCE: {
    MANUAL: 'Manual',
    INTERNAL: 'Internal',
    EXTERNAL: 'External',
  },
  async batchDelete(ids: string[]) {
    // Quality Loss records come from multiple sources.
    // However, the `deleteQualityLoss` API only supports deleting from `quality_losses` (Manual).
    // For batch delete, we should probably check the source or only delete manual ones for now,
    // OR we assume the IDs passed are the primary keys (`pk`) of the manual records.
    // Based on `getAllLosses`, `pk` is the real ID.
    // Let's assume we are deleting manual records only for now as other sources are managed in their respective modules.
    // If the ID exists in `quality_losses`, delete it.
    
    return prisma.quality_losses.updateMany({
      where: { id: { in: ids } },
      data: { isDeleted: true }
    });
  },
};

/**
 * 格式化日期
 */
const formatDate = (date: Date | null) => {
  if (!date) return null;
  return date.toISOString().split('T')[0];
};

/**
 * 合并统计数据
 */
const mergeTrendData = (manual: any[], internal: any[], external: any[]) => {
  const merged = new Map<
    number,
    { external: number; internal: number; manual: number }
  >();

  const process = (rows: any[], key: 'external' | 'internal' | 'manual') => {
    rows.forEach((r) => {
      const p = Number(r.p);
      if (p === 0) return;
      let item = merged.get(p);
      if (!item) {
        item = { external: 0, internal: 0, manual: 0 };
        merged.set(p, item);
      }
      const v = Number(r.a) || 0;
      item[key] += v;
    });
  };

  process(manual, 'manual');
  process(internal, 'internal');
  process(external, 'external');

  return merged;
};

export const QualityLossService = {
  async getTrendData(granularity: 'month' | 'week') {
    const year = new Date().getFullYear();
    const isWeek = granularity === 'week';

    try {
      // MySQL WEEK mode 3: Monday 1-53
      const timeFunc = isWeek ? 'WEEK(occurDate, 3)' : 'MONTH(occurDate)';
      const timeFunc2 = isWeek ? 'WEEK(date, 3)' : 'MONTH(date)';

      const [manual, internal, external] = (await Promise.all([
        prisma.$queryRawUnsafe(
          `SELECT ${timeFunc} as p, SUM(amount) as a FROM quality_losses WHERE YEAR(occurDate) = ${year} AND isDeleted = 0 GROUP BY p`,
        ),
        prisma.$queryRawUnsafe(
          `SELECT ${timeFunc2} as p, SUM(lossAmount) as a FROM quality_records WHERE YEAR(date) = ${year} AND isDeleted = 0 GROUP BY p`,
        ),
        prisma.$queryRawUnsafe(
          `SELECT ${timeFunc} as p, SUM(materialCost + laborTravelCost) as a FROM after_sales WHERE YEAR(occurDate) = ${year} AND isDeleted = 0 GROUP BY p`,
        ),
      ])) as [any[], any[], any[]];

      const merged = mergeTrendData(manual, internal, external);

      const result = [...merged.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([k, v]) => {
          const total = v.manual + v.internal + v.external;
          const label = isWeek ? `W${k}` : QL_CONSTANTS.MONTHS[k - 1] || `${k}`;
          return {
            period: label,
            totalAmount: Number(total.toFixed(2)),
            manualAmount: Number(v.manual.toFixed(2)),
            internalAmount: Number(v.internal.toFixed(2)),
            externalAmount: Number(v.external.toFixed(2)),
          };
        });

      return { trend: result };
    } catch (error) {
      console.error('QualityLossService.getTrendData 执行失败:', error);
      return { trend: [] };
    }
  },

  async getDrillDown(start: Date, end: Date) {
    try {
      const [manualLosses, internalLosses, externalLosses] = await Promise.all([
        prisma.quality_losses.findMany({
          where: { isDeleted: false, occurDate: { gte: start, lte: end } },
          orderBy: { occurDate: 'desc' },
        }),
        prisma.quality_records.findMany({
          where: { isDeleted: false, date: { gte: start, lte: end } },
          orderBy: { date: 'desc' },
        }),
        prisma.after_sales.findMany({
          where: { isDeleted: false, occurDate: { gte: start, lte: end } },
          orderBy: { occurDate: 'desc' },
        }),
      ]);
      return { manualLosses, internalLosses, externalLosses };
    } catch (error) {
      console.error('QualityLossService.getDrillDown 执行失败:', error);
      return { manualLosses: [], internalLosses: [], externalLosses: [] };
    }
  },

  async getAllLosses() {
    try {
      const [manualRecords, internalRecords, externalRecords] =
        await Promise.all([
          prisma.quality_losses.findMany({
            where: { isDeleted: false },
            orderBy: { createdAt: 'desc' },
          }),
          prisma.quality_records.findMany({
            where: { isDeleted: false, isClaim: true },
            orderBy: { createdAt: 'desc' },
          }),
          prisma.after_sales.findMany({
            where: { isDeleted: false, isClaim: true },
            orderBy: { createdAt: 'desc' },
          }),
        ]);

      const result: any[] = [];

      // 1. Manual Records
      manualRecords.forEach((item) => {
        result.push({
          ...item,
          id: item.lossId || item.id,
          pk: item.id,
          date: formatDate(item.occurDate),
          responsibleDepartment: item.respDept,
          lossSource: QL_CONSTANTS.SOURCE.MANUAL,
          workOrderNumber: '-',
          projectName: '-',
          partName: item.type,
          actualClaim: Number(item.actualClaim || 0),
        });
      });

      // 2. Internal Records
      internalRecords.forEach((item) => {
        result.push({
          id: `INT-${item.serialNumber}`,
          pk: item.id,
          date: formatDate(item.date),
          amount: Number(item.lossAmount),
          responsibleDepartment: item.responsibleDepartment,
          description: item.description,
          status:
            item.status === QL_CONSTANTS.STATUS.CLOSED
              ? QL_CONSTANTS.STATUS.CONFIRMED
              : QL_CONSTANTS.STATUS.PENDING,
          type: QL_CONSTANTS.SOURCE.INTERNAL,
          lossSource: QL_CONSTANTS.SOURCE.INTERNAL,
          workOrderNumber: item.workOrderNumber,
          projectName: item.projectName,
          partName: item.partName,
          actualClaim: Number(item.recoveredAmount || 0),
          createdAt: item.createdAt,
        });
      });

      // 3. External Records
      externalRecords.forEach((item) => {
        const totalAmount =
          Number(item.materialCost || 0) + Number(item.laborTravelCost || 0);
        result.push({
          id: `EXT-${item.serialNumber}`,
          pk: item.id,
          date: formatDate(item.occurDate),
          amount: totalAmount,
          responsibleDepartment: item.respDept,
          description: item.issueDescription,
          status:
            item.claimStatus === QL_CONSTANTS.STATUS.CLOSED
              ? QL_CONSTANTS.STATUS.CONFIRMED
              : QL_CONSTANTS.STATUS.PENDING,
          type: QL_CONSTANTS.SOURCE.EXTERNAL,
          lossSource: QL_CONSTANTS.SOURCE.EXTERNAL,
          workOrderNumber: item.workOrderNumber,
          projectName: item.projectName,
          partName: item.productSubtype || item.productType,
          actualClaim: Number(item.actualClaim || 0),
          createdAt: item.createdAt,
        });
      });

      // Sort by date desc
      return result.sort((a, b) => {
        const t1 = new Date(a.date).getTime();
        const t2 = new Date(b.date).getTime();
        return t2 - t1;
      });
    } catch (error) {
      console.error('QualityLossService.getAllLosses 执行失败:', error);
      return [];
    }
  },
};
