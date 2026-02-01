import { QMS_DEFAULT_VALUES, QMS_STATUS_OPEN_SET } from '@qgs/shared';
import prisma from '~/utils/prisma';
import { createModuleLogger } from '~/utils/logger';

// 创建模块级 logger
const logger = createModuleLogger('AfterSalesService');

export const AfterSalesService = {
  /**
   * Calculate After-Sales KPI and Statistics
   */
  async getStats(year?: number) {
    const currentYear = year || new Date().getFullYear();

    // Local date range for the specified year
    const startDate = new Date(currentYear, 0, 1, 0, 0, 0, 0);
    const endDate = new Date(currentYear, 11, 31, 23, 59, 59, 999);

    // Define months for trend analysis
    const months = Array.from({ length: 12 }, (_, i) => `${i + 1}月`);

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
      const openStatus = QMS_STATUS_OPEN_SET;
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
      const monthlyIssues: number[] = Array.from({ length: 12 }).fill(
        0,
      ) as number[];
      const monthlyClosed: number[] = Array.from({ length: 12 }).fill(
        0,
      ) as number[];
      const monthlyCosts: number[] = Array.from({ length: 12 }).fill(
        0,
      ) as number[];

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
        const type = r.defectType || QMS_DEFAULT_VALUES.UNCLASSIFIED;
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
        const dept = r.respDept || QMS_DEFAULT_VALUES.UNASSIGNED;
        deptMap.set(dept, (deptMap.get(dept) || 0) + 1);
      });
      const deptDistribution = [...deptMap.entries()]
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value);

      return {
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
      };
    } catch (error) {
      logger.error({ err: error }, 'getStats failed');
      // Return empty structure on error
      return {
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
      };
    }
  },

  /**
   * Get List of After-Sales Records with filtering
   */
  async getList(params: {
    projectName?: string;
    status?: string;
    supplierBrand?: string;
    workOrderNumber?: string;
    year?: number;
  }) {
    const { year, workOrderNumber, projectName, status, supplierBrand } =
      params;

    // Date Logic
    let dateFilter: Record<string, Date> = {};
    if (year) {
      dateFilter = {
        gte: new Date(`${year}-01-01T00:00:00.000Z`),
        lte: new Date(`${year}-12-31T23:59:59.999Z`),
      };
    }

    const where: Record<string, any> = {
      isDeleted: false,
    };

    if (year) where.occurDate = dateFilter;
    if (workOrderNumber && String(workOrderNumber).trim() !== '') {
      where.workOrderNumber = String(workOrderNumber).trim();
    }
    if (projectName && String(projectName).trim() !== '') {
      where.projectName = { contains: String(projectName).trim() };
    }
    if (status && String(status).trim() !== '') {
      where.claimStatus = String(status).trim();
    }
    if (supplierBrand && String(supplierBrand).trim() !== '') {
      where.OR = [
        { supplierBrand: { contains: String(supplierBrand).trim() } },
        { projectName: { contains: String(supplierBrand).trim() } },
      ];
    }

    const list = await prisma.after_sales.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    // Helper function to format date as YYYY-MM-DD
    const formatDate = (date: Date | null | undefined) => {
      if (!date) return null;
      return date.toISOString().split('T')[0];
    };

    // Map to frontend expectation with formatted dates
    return list.map((item) => ({
      ...item,
      issueDate: formatDate(item.occurDate),
      occurDate: formatDate(item.occurDate),
      factoryDate: formatDate(item.factoryDate),
      closeDate: formatDate(item.closeDate),
      shipDate: formatDate(item.shipDate),
      createdAt: formatDate(item.createdAt),
      responsibleDept: item.respDept,
      resolutionPlan: item.solution,
      status: item.claimStatus,
      isClaim: item.isClaim,
    }));
  },
};
