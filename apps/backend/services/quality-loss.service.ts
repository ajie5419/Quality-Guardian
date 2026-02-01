import prisma from '~/utils/prisma';

// 常量定义
const QL_CONSTANTS = {
  MONTHS: [
    '1月',
    '2月',
    '3月',
    '4月',
    '5月',
    '6月',
    '7月',
    '8月',
    '9月',
    '10月',
    '11月',
    '12月',
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
      const timeFunc = isWeek ? 'WEEK(occurDate, 3)' : 'MONTH(occurDate)';
      const timeFunc2 = isWeek ? 'WEEK(date, 3)' : 'MONTH(date)';

      const [manual, internal, external] = await Promise.all([
        prisma.$queryRawUnsafe(
          `SELECT ${timeFunc} as p, SUM(amount) as a FROM quality_losses WHERE YEAR(occurDate) = ${year} AND isDeleted = 0 GROUP BY p`,
        ),
        prisma.$queryRawUnsafe(
          `SELECT ${timeFunc2} as p, SUM(IFNULL(lossAmount, 0)) as a FROM quality_records WHERE YEAR(date) = ${year} AND isDeleted = 0 GROUP BY p`,
        ),
        prisma.$queryRawUnsafe(
          `SELECT ${timeFunc} as p, SUM(IFNULL(materialCost, 0) + IFNULL(laborTravelCost, 0)) as a FROM after_sales WHERE YEAR(occurDate) = ${year} AND isDeleted = 0 GROUP BY p`,
        ),
      ]);

      const merged = mergeTrendData(
        manual as any[],
        internal as any[],
        external as any[],
      );
      let result: any[] = [];

      if (isWeek) {
        result = [...merged.entries()]
          .sort((a, b) => a[0] - b[0])
          .map(([k, v]) => {
            const total = v.manual + v.internal + v.external;
            return {
              period: `W${k}`,
              totalAmount: Number(total.toFixed(2)),
              manualAmount: Number(v.manual.toFixed(2)),
              internalAmount: Number(v.internal.toFixed(2)),
              externalAmount: Number(v.external.toFixed(2)),
            };
          });
      } else {
        result = [];
        for (let k = 1; k <= 12; k++) {
          const v = merged.get(k) || {
            external: 0,
            internal: 0,
            manual: 0,
          };
          const total = v.manual + v.internal + v.external;
          result.push({
            period: QL_CONSTANTS.MONTHS[k - 1] ?? `${k}月`,
            totalAmount: Number(total.toFixed(2)),
            manualAmount: Number(v.manual.toFixed(2)),
            internalAmount: Number(v.internal.toFixed(2)),
            externalAmount: Number(v.external.toFixed(2)),
          });
        }
      }

      return { trend: result };
    } catch (error) {
      console.error('QualityLossService.getTrendData 执行失败:', error);
      return { trend: [] };
    }
  },

  async getAllLosses(
    params: {
      lossSource?: string;
      page?: number;
      pageSize?: number;
      status?: string;
      workOrderNumber?: string;
    } = {},
  ) {
    const {
      lossSource,
      page = 1,
      pageSize = 20,
      status,
      workOrderNumber,
    } = params;

    try {
      // 1. 获取所有来源的原始数据
      const [manualRecords, internalRecords, externalRecords] =
        await Promise.all([
          prisma.quality_losses.findMany({
            where: {
              isDeleted: false,
              ...(status ? { status } : {}),
              // 注意：quality_losses 确实没有 workOrderNumber。我们在这里不做过滤，而是在后面 result 组装时处理
            },
          }),
          prisma.quality_records.findMany({
            where: {
              isDeleted: false,
              lossAmount: { gt: 0 },
              ...(status ? { status: status as any } : {}),
              ...(workOrderNumber
                ? { workOrderNumber: { contains: workOrderNumber } }
                : {}),
            },
          }),
          prisma.after_sales.findMany({
            where: {
              isDeleted: false,
              ...(status ? { claimStatus: status as any } : {}),
              ...(workOrderNumber
                ? { workOrderNumber: { contains: workOrderNumber } }
                : {}),
            },
          }),
        ]);

      const result: any[] = [];

      // 逻辑处理：合并
      if (!lossSource || lossSource === QL_CONSTANTS.SOURCE.MANUAL) {
        // 对于手动增加的记录，如果指定了 workOrderNumber 且该记录没有（或不匹配），则过滤
        const filteredManual = workOrderNumber
          ? manualRecords.filter((r) =>
              (r as any).workOrderNumber?.includes(workOrderNumber),
            )
          : manualRecords;

        filteredManual.forEach((item: any) => {
          const amount = Number(item.amount || 0);
          if (amount <= 0) return;
          result.push({
            ...item,
            id: item.lossId || item.id,
            pk: item.id,
            date: formatDate(item.occurDate),
            responsibleDepartment: item.respDept,
            lossSource: QL_CONSTANTS.SOURCE.MANUAL,
            workOrderNumber: item.workOrderNumber || '-',
            projectName: item.projectName || '-',
            partName: item.type,
            amount,
            actualClaim: Number(item.actualClaim || 0),
          });
        });
      }

      if (!lossSource || lossSource === QL_CONSTANTS.SOURCE.INTERNAL) {
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
      }

      if (!lossSource || lossSource === QL_CONSTANTS.SOURCE.EXTERNAL) {
        externalRecords.forEach((item) => {
          const amount =
            Number(item.materialCost || 0) + Number(item.laborTravelCost || 0);
          if (amount <= 0) return;
          result.push({
            id: `EXT-${item.serialNumber}`,
            pk: item.id,
            date: formatDate(item.occurDate),
            amount,
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
            partName: item.partName || item.productSubtype || item.productType,
            actualClaim: Number(item.actualClaim || 0),
            createdAt: item.createdAt,
          });
        });
      }

      // 排序
      result.sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
      );

      const total = result.length;
      const items = result.slice((page - 1) * pageSize, page * pageSize);

      return { items, total };
    } catch (error) {
      console.error('QualityLossService.getAllLosses 执行失败:', error);
      return { items: [], total: 0 };
    }
  },

  /**
   * 获取损益概览统计（全量数据集，不分页，仅用于图表和KPI）
   */
  async getLossSummary(filters: any) {
    const { items } = await this.getAllLosses({
      ...filters,
      page: 1,
      pageSize: 100_000,
    });
    return items;
  },

  async batchDelete(ids: string[]) {
    return prisma.quality_losses.updateMany({
      where: { id: { in: ids } },
      data: { isDeleted: true },
    });
  },
};
