import prisma from '~/utils/prisma';

export const DashboardService = {
  async getStats() {
    const now = new Date();
    const currentYear = now.getFullYear();
    const dayOfWeek = now.getDay();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    weekStart.setHours(0, 0, 0, 0);

    const currentYearStart = new Date(currentYear, 0, 1);
    currentYearStart.setHours(0, 0, 0, 0);

    // Run aggregations in parallel
    const [
      afterSalesStats,
      qualityRecordStats,
      workOrderStats,
      qualityLossStats,
      recentWorkOrders,
    ] = await Promise.all([
      // 1. After Sales (Field Issues)
      prisma.after_sales.aggregate({
        where: { isDeleted: false, occurDate: { gte: currentYearStart } },
        _count: { id: true },
        _sum: { materialCost: true, laborTravelCost: true },
      }),
      // 2. Quality Records (Process Issues)
      prisma.quality_records.aggregate({
        where: { isDeleted: false, date: { gte: currentYearStart } },
        _count: { id: true },
        _sum: { lossAmount: true },
      }),
      // 3. Work Orders
      prisma.work_orders.aggregate({
        where: { isDeleted: false, createdAt: { gte: currentYearStart } },
        _count: { workOrderNumber: true },
      }),
      // 4. Manual Quality Losses
      prisma.quality_losses.aggregate({
        where: { isDeleted: false, occurDate: { gte: currentYearStart } },
        _sum: { amount: true },
      }),
      // 5. Recent WOs
      prisma.work_orders.findMany({
        where: { isDeleted: false },
        take: 5,
        orderBy: { createdAt: 'desc' },
        select: {
          workOrderNumber: true,
          projectName: true,
          status: true,
          customerName: true,
        },
      }),
    ]);

    // Note: For "Weekly" stats, ideally we do another query or just return "Yearly" for now to save 2G RAM DB connection?
    // The original code queried BOTH. To save resources, let's query Weekly separately only if strictly needed.
    // However, the dashboard probably needs both.
    // Optimization: Group by "is this week" flag? No, too complex.
    // Let's do a second parallel batch for Weekly, but minimized.

    const [
      weeklyAfterSales,
      weeklyQualityRecords,
      weeklyWorkOrders,
      weeklyLosses,
    ] = await Promise.all([
      prisma.after_sales.count({
        where: { isDeleted: false, occurDate: { gte: weekStart } },
      }),
      prisma.quality_records.count({
        where: { isDeleted: false, date: { gte: weekStart } },
      }),
      prisma.work_orders.count({
        where: { isDeleted: false, createdAt: { gte: weekStart } },
      }),
      // Calculate weekly loss sum
      Promise.all([
        prisma.after_sales.aggregate({
          where: { isDeleted: false, occurDate: { gte: weekStart } },
          _sum: { materialCost: true, laborTravelCost: true },
        }),
        prisma.quality_records.aggregate({
          where: { isDeleted: false, date: { gte: weekStart } },
          _sum: { lossAmount: true },
        }),
        prisma.quality_losses.aggregate({
          where: { isDeleted: false, occurDate: { gte: weekStart } },
          _sum: { amount: true },
        }),
      ]),
    ]);

    // Weekly Loss Calculation
    const wLoss = weeklyLosses; // [afterSales, records, manual]
    const weeklyLossTotal =
      (Number(wLoss[0]._sum.materialCost) || 0) +
      (Number(wLoss[0]._sum.laborTravelCost) || 0) +
      (Number(wLoss[1]._sum.lossAmount) || 0) +
      (Number(wLoss[2]._sum.amount) || 0);

    const totalLoss =
      (Number(afterSalesStats._sum.materialCost) || 0) +
      (Number(afterSalesStats._sum.laborTravelCost) || 0) +
      (Number(qualityRecordStats._sum.lossAmount) || 0) +
      (Number(qualityLossStats._sum.amount) || 0);

    return {
      overview: {
        fieldIssues: {
          open: weeklyAfterSales,
          total: afterSalesStats._count.id,
        },
        processIssues: {
          open: weeklyQualityRecords,
          total: qualityRecordStats._count.id,
        },
        qualityLoss: { weekly: weeklyLossTotal, total: totalLoss },
        workOrders: {
          weekly: weeklyWorkOrders,
          total: workOrderStats._count.workOrderNumber,
        },
      },
      recentWorkOrders,
    };
  },

  async getMonthlyTrend() {
    const currentYear = new Date().getFullYear();
    // Optimized: Use Raw Query for aggregation to avoid loading all data
    // Assuming MySQL
    try {
      const result = await prisma.$queryRaw`
            SELECT 
                MONTH(date) as month, 
                SUM(quantity) as totalQty,
                SUM(CASE WHEN result = 'PASS' THEN quantity ELSE 0 END) as qualifiedQty
            FROM inspections 
            WHERE YEAR(date) = ${currentYear} AND isDeleted = 0
            GROUP BY MONTH(date)
            ORDER BY month ASC
        `;

      // Also need defect quantity from quality_records
      const defects = await prisma.$queryRaw`
            SELECT 
                MONTH(date) as month, 
                SUM(quantity) as defectQty
            FROM quality_records
            WHERE YEAR(date) = ${currentYear} AND isDeleted = 0
            GROUP BY MONTH(date)
        `;

      // Merge in JS (arrays are small, 12 items max)
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
      return months.map((m, idx) => {
        const mIdx = idx + 1;
        const insp = (result as any[]).find((r) => r.month === mIdx) || {
          totalQty: 0,
          qualifiedQty: 0,
        };
        const def = (defects as any[]).find((r) => r.month === mIdx) || {
          defectQty: 0,
        };

        const total = Number(insp.totalQty) || 0;
        const qualified = Number(insp.qualifiedQty) || 0;
        const defect = Number(def.defectQty) || 0;

        let passRate = 98.5; // Default target
        if (total > 0) {
          const netQualified = Math.max(0, qualified - defect);
          passRate = Number(((netQualified / total) * 100).toFixed(1));
        }

        return {
          period: m,
          passRate: idx > new Date().getMonth() ? null : passRate,
        };
      });
    } catch (error) {
      console.error('Monthly trend error', error);
      return [];
    }
  },

  async getIssueDistribution() {
    const currentYear = new Date().getFullYear();
    try {
      const stats = await prisma.quality_records.groupBy({
        by: ['defectType'],
        where: { isDeleted: false, date: { gte: new Date(currentYear, 0, 1) } },
        _count: true,
      });
      return stats.map((s) => ({
        type: s.defectType || 'Unknown',
        value: s._count,
      }));
    } catch {
      return [];
    }
  },
};
