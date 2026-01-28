import prisma from '~/utils/prisma';

export const QualityLossService = {
  async getTrendData(granularity: 'month' | 'week') {
    const year = new Date().getFullYear();
    const isWeek = granularity === 'week';

    // MySQL WEEK mode 3: Monday 1-53
    // Use raw query for aggregation
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

    const merged = new Map<
      number,
      { external: number; internal: number; manual: number }
    >();

    const process = (rows: any[], key: 'external' | 'internal' | 'manual') => {
      rows.forEach((r) => {
        const p = Number(r.p);
        if (p === 0) return; // Skip invalid
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

    const result = [...merged.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([k, v]) => {
        const total = v.manual + v.internal + v.external;
        let label = '';
        if (isWeek) {
          label = `W${k}`;
        } else {
          const months = [
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
          ];
          label = months[k - 1] || `${k}`;
        }
        return {
          period: label,
          totalAmount: Number(total.toFixed(2)),
          manualAmount: Number(v.manual.toFixed(2)),
          internalAmount: Number(v.internal.toFixed(2)),
          externalAmount: Number(v.external.toFixed(2)),
        };
      });

    return { trend: result };
  },

  async getDrillDown(start: Date, end: Date) {
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
  },

  async getAllLosses() {
    // 1. Fetch Manual Records
    const manualRecords = await prisma.quality_losses.findMany({
      where: { isDeleted: false },
      orderBy: { createdAt: 'desc' },
    });

    // 2. Fetch Internal Loss (Engineering Problems)
    const internalRecords = await prisma.quality_records.findMany({
      where: {
        isDeleted: false,
        isClaim: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    // 3. Fetch External Loss (After-sales Problems)
    const externalRecords = await prisma.after_sales.findMany({
      where: {
        isDeleted: false,
        isClaim: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const formatDate = (date: Date | null) => {
      if (!date) return null;
      return date.toISOString().split('T')[0];
    };

    const result: any[] = [];

    // Map Manual Records
    manualRecords.forEach((item) => {
      result.push({
        ...item,
        id: item.lossId || item.id,
        pk: item.id,
        date: formatDate(item.occurDate),
        responsibleDepartment: item.respDept,
        lossSource: 'Manual',
        workOrderNumber: '-',
        projectName: '-',
        partName: item.type,
        actualClaim: Number(item.actualClaim || 0),
      });
    });

    // Map Internal Records
    internalRecords.forEach((item) => {
      result.push({
        id: `INT-${item.serialNumber}`,
        pk: item.id,
        date: formatDate(item.date),
        amount: Number(item.lossAmount),
        responsibleDepartment: item.responsibleDepartment,
        description: item.description,
        // Map original status (CLOSED -> Confirmed, OPEN -> Pending)
        status: item.status === 'CLOSED' ? 'Confirmed' : 'Pending',
        type: 'Internal',
        lossSource: 'Internal',
        workOrderNumber: item.workOrderNumber,
        projectName: item.projectName,
        partName: item.partName,
        actualClaim: Number(item.recoveredAmount || 0),
        createdAt: item.createdAt,
      });
    });

    // Map External Records
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
        // Map original claimStatus (CLOSED -> Confirmed, OPEN/IN_PROGRESS -> Pending)
        status: item.claimStatus === 'CLOSED' ? 'Confirmed' : 'Pending',
        type: 'External',
        lossSource: 'External',
        workOrderNumber: item.workOrderNumber,
        projectName: item.projectName,
        partName: item.productSubtype || item.productType,
        actualClaim: Number(item.actualClaim || 0),
        createdAt: item.createdAt,
      });
    });

    // Sort by date desc
    result.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );

    return result;
  },
};
