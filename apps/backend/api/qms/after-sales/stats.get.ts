import { defineEventHandler, getQuery } from 'h3';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import { unAuthorizedResponse, useResponseSuccess } from '~/utils/response';

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  const { year } = getQuery(event);
  const currentYear = year
    ? Number.parseInt(String(year))
    : new Date().getFullYear();

  // Local date range for the specified year
  const startDate = new Date(currentYear, 0, 1, 0, 0, 0, 0);
  const endDate = new Date(currentYear, 11, 31, 23, 59, 59, 999);

  try {
    // 1. Fetch all relevant records for the year
    const records = await prisma.after_sales.findMany({
      where: {
        isDeleted: false,
        occurDate: {
          gte: startDate,
          lte: endDate,
        },
      },
    });

    // 2. Calculate KPI Data
    const total = records.length;
    const openStatus = new Set(['IN_PROGRESS', 'OPEN', '处理中', '待处理']);
    const open = records.filter((r) => openStatus.has(r.claimStatus)).length;

    let totalCost = 0;
    for (const r of records) {
      const material = Number(r.materialCost) || 0;
      const labor = Number(r.laborTravelCost) || 0;
      totalCost += material + labor;
    }

    // Calculate Average Resolution Time (in days)
    const resolvedRecords = records.filter((r) => r.closeDate && r.occurDate);
    let totalDays = 0;
    for (const r of resolvedRecords) {
      const start = new Date(r.occurDate).getTime();
      const end = new Date(r.closeDate).getTime();
      totalDays += (end - start) / (1000 * 60 * 60 * 24);
    }
    const avgTime =
      resolvedRecords.length > 0 ? totalDays / resolvedRecords.length : 0;

    // 3. Trend Analysis (Monthly)
    const months = Array.from({ length: 12 }, (_, i) => `${i + 1}月`);
    const monthlyIssues = Array.from({ length: 12 }).fill(0);
    const monthlyClosed = Array.from({ length: 12 }).fill(0);
    const monthlyCosts = Array.from({ length: 12 }).fill(0);

    records.forEach((r) => {
      const date = new Date(r.occurDate);
      const month = date.getMonth();
      if (month >= 0 && month < 12) {
        monthlyIssues[month]++;
        const material = Number(r.materialCost) || 0;
        const labor = Number(r.laborTravelCost) || 0;
        monthlyCosts[month] += material + labor;
      }

      if (r.closeDate) {
        const cDate = new Date(r.closeDate);
        if (cDate.getFullYear() === currentYear) {
          const cMonth = cDate.getMonth();
          if (cMonth >= 0 && cMonth < 12) {
            monthlyClosed[cMonth]++;
          }
        }
      }
    });

    // 4. Defect Distribution
    const defectMap = new Map<string, number>();
    records.forEach((r) => {
      const type = r.defectType || '未分类';
      defectMap.set(type, (defectMap.get(type) || 0) + 1);
    });
    const defectDistribution = [...defectMap.entries()].map(
      ([name, value]) => ({ name, value }),
    );

    // 5. Supplier Ranking (Top 5)
    const supplierMap = new Map<string, number>();
    records.forEach((r) => {
      if (r.supplierBrand) {
        supplierMap.set(
          r.supplierBrand,
          (supplierMap.get(r.supplierBrand) || 0) + 1,
        );
      }
    });
    const sortedSuppliers = [...supplierMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    const supplierRanking = {
      categories: sortedSuppliers.map((s) => s[0]),
      data: sortedSuppliers.map((s) => s[1]),
    };

    // 6. Department Responsibility Analysis
    const deptMap = new Map<string, number>();
    records.forEach((r) => {
      const dept = r.respDept || '未分配';
      deptMap.set(dept, (deptMap.get(dept) || 0) + 1);
    });
    const deptDistribution = [...deptMap.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    return useResponseSuccess({
      kpi: {
        total,
        open,
        cost: Number(totalCost.toFixed(2)),
        avgTime: Number(avgTime.toFixed(1)),
      },
      trend: {
        category: months,
        issues: monthlyIssues,
        closed: monthlyClosed,
        costs: monthlyCosts.map((c) => Number(c.toFixed(2))),
      },
      defectDistribution,
      supplierRanking,
      deptDistribution,
    });
  } catch (error) {
    console.error('Failed to calculate after-sales stats:', error);
    return useResponseSuccess({
      kpi: { total: 0, open: 0, cost: 0, avgTime: 0 },
      trend: {
        category: months,
        issues: Array.from({ length: 12 }).fill(0),
        closed: Array.from({ length: 12 }).fill(0),
        costs: Array.from({ length: 12 }).fill(0),
      },
      defectDistribution: [],
      supplierRanking: { categories: [], data: [] },
      deptDistribution: [],
    });
  }
});
