import prisma from '~/utils/prisma';

import { DataScopeService } from './data-scope.service';

// --- Scoring Constants (Configurable) ---
const THRESHOLD_CLASS_A_AMOUNT = 5000; // Class A: Loss > 5000
const THRESHOLD_CRITICAL_AMOUNT = 80_000; // Blacklist: Loss > 80000
const THRESHOLD_SCORE_WARNING = 75;
const THRESHOLD_INCOMING_YIELD_WARNING = 90;

const LIMIT_CONSECUTIVE_FAILURE = 3; // 3x Consecutive A/B -> Blacklist
const LIMIT_MIN_ISSUE_COUNT_FOR_STRICT_ACTION = 3;

interface SupplierStats {
  afterSalesClassA: number;
  afterSalesClassB: number;
  afterSalesClassC: number;
  afterSalesCount: number;
  afterSalesLoss: number;
  consecutiveBigFailures: number;
  count: number;
  engineeringClassA: number;
  engineeringClassB: number;
  engineeringClassC: number;
  engineeringCount: number;
  engineeringDefectQuantity: number;
  engineeringLoss: number;
  failures: number;
  failuresQuantity: number;
  maxSingleLoss: number;
  openAfterSalesCount: number;
  openEngineeringCount: number;
  qualifiedCount: number;
  quantity: number;
}

function createEmptyStats(): SupplierStats {
  return {
    count: 0,
    quantity: 0,
    qualifiedCount: 0,
    failures: 0,
    failuresQuantity: 0,
    afterSalesLoss: 0,
    engineeringLoss: 0,
    afterSalesCount: 0,
    engineeringCount: 0,
    engineeringDefectQuantity: 0,
    engineeringClassA: 0,
    engineeringClassB: 0,
    engineeringClassC: 0,
    afterSalesClassA: 0,
    afterSalesClassB: 0,
    afterSalesClassC: 0,
    openEngineeringCount: 0,
    openAfterSalesCount: 0,
    consecutiveBigFailures: 0,
    maxSingleLoss: 0,
  };
}

function clamp100(value: number) {
  return Math.max(0, Math.min(100, value));
}

export interface SupplierQueryParams {
  page?: number;
  pageSize?: number;
  category?: string;
  status?: string;
  keyword?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  name?: string;
  userContext?: { userId: string; username?: string };
}

export const SupplierService = {
  /**
   * Find all suppliers with advanced filtering, scoring, and aggregation
   */
  async findAll(params: SupplierQueryParams) {
    const {
      page = 1,
      pageSize = 20,
      category,
      status,
      keyword,
      sortBy,
      sortOrder,
    } = params;

    // 1. 构造极其稳健的过滤条件
    const where: Record<string, unknown> = { isDeleted: false };
    if (category) {
      const cat = category.toLowerCase();
      if (cat === 'supplier' || cat === 'productionunit') {
        where.NOT = { category: { contains: 'Outsourcing' } };
      } else if (cat === 'outsourcing') {
        where.category = { contains: 'Outsourcing' };
      } else {
        where.category = { contains: category };
      }
    }
    if (status) where.status = status;
    if (keyword) {
      where.OR = [
        { name: { contains: keyword } },
        { contact: { contains: keyword } },
        { email: { contains: keyword } },
        { phone: { contains: keyword } },
      ];
    }

    const scopedWhere = params.userContext?.userId
      ? await DataScopeService.buildSupplierWhere(where, {
          userId: params.userContext.userId,
          username: params.userContext.username,
        })
      : where;

    // 2. 执行核心查询
    const [rawItems, totalCount] = await Promise.all([
      prisma.suppliers.findMany({
        where: scopedWhere,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.suppliers.count({ where: scopedWhere }),
    ]);

    // 3. 安全的数据映射
    const listData = rawItems.map((item) => ({
      ...item,
      qualityScore: item.qualityScore ?? 100,
      level: item.rating || 'A',
      status: item.status || 'Qualified',
      createdAt:
        item.createdAt instanceof Date ? item.createdAt.toISOString() : null,
      updatedAt:
        item.updatedAt instanceof Date ? item.updatedAt.toISOString() : null,
    }));

    // 4. Statistics Aggregation
    // Get ALL supplier names to calculate global stats
    const supplierNames = listData.map((i) => i.name).filter(Boolean);
    const statsMap = new Map<string, SupplierStats>();

    const now = new Date();
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(now.getFullYear() - 1);

    if (supplierNames.length > 0) {
      const [
        incomingStats,
        afterSalesStats,
        engineeringStats,
        engineeringStatusStats,
        afterSalesStatusStats,
        recentAfterSales,
        recentQualityRecords,
      ] = await Promise.all([
        prisma.inspections.groupBy({
          by: ['supplierName', 'result'],
          where: {
            supplierName: { in: supplierNames },
            category: 'INCOMING',
            isDeleted: false,
            inspectionDate: { gte: oneYearAgo },
          },
          _count: { id: true },
          _sum: { quantity: true },
        }),
        prisma.after_sales.groupBy({
          by: ['supplierBrand'],
          where: {
            supplierBrand: { in: supplierNames },
            isDeleted: false,
            occurDate: { gte: oneYearAgo },
          },
          _sum: { materialCost: true, laborTravelCost: true },
          _count: { id: true },
        }),
        prisma.quality_records.groupBy({
          by: ['supplierName'],
          where: {
            supplierName: { in: supplierNames },
            isDeleted: false,
            date: { gte: oneYearAgo },
          },
          _sum: { lossAmount: true, quantity: true },
          _count: { id: true },
        }),
        prisma.quality_records.groupBy({
          by: ['supplierName', 'status'],
          where: {
            supplierName: { in: supplierNames },
            isDeleted: false,
            date: { gte: oneYearAgo },
          },
          _count: { id: true },
        }),
        prisma.after_sales.groupBy({
          by: ['supplierBrand', 'claimStatus'],
          where: {
            supplierBrand: { in: supplierNames },
            isDeleted: false,
            occurDate: { gte: oneYearAgo },
          },
          _count: { id: true },
        }),
        prisma.after_sales.findMany({
          where: {
            supplierBrand: { in: supplierNames },
            isDeleted: false,
            occurDate: { gte: oneYearAgo },
          },
          select: {
            supplierBrand: true,
            materialCost: true,
            laborTravelCost: true,
            severity: true,
            occurDate: true,
          },
          orderBy: { occurDate: 'desc' },
        }),
        prisma.quality_records.findMany({
          where: {
            supplierName: { in: supplierNames },
            isDeleted: false,
            date: { gte: oneYearAgo },
          },
          select: {
            supplierName: true,
            lossAmount: true,
            severity: true,
            date: true,
          },
          orderBy: { date: 'desc' },
        }),
      ]);

      const classifyDefect = (
        loss: number,
        severity?: string,
      ): 'A' | 'B' | 'C' | null => {
        const sev = (severity || '').toLowerCase();
        if (loss > THRESHOLD_CLASS_A_AMOUNT) return 'A';
        if (['critical', 'fatal', 'p0', 'p1', '致命'].includes(sev)) return 'A';
        if (['high', 'major', 'p2'].includes(sev)) return 'B';
        if (['low', 'minor', 'p3'].includes(sev)) return 'C';
        return null;
      };

      incomingStats.forEach((s) => {
        if (s.supplierName) {
          const current = statsMap.get(s.supplierName) || createEmptyStats();
          current.count += s._count.id;
          current.quantity += s._sum.quantity || 0;
          if (s.result === 'PASS') {
            current.qualifiedCount += s._count.id;
          } else if (s.result === 'FAIL') {
            current.failures += s._count.id;
            current.failuresQuantity += s._sum.quantity || 0;
          }
          statsMap.set(s.supplierName, current);
        }
      });

      afterSalesStats.forEach((s) => {
        if (s.supplierBrand) {
          const current = statsMap.get(s.supplierBrand) || createEmptyStats();
          current.afterSalesLoss +=
            Number(s._sum.materialCost || 0) +
            Number(s._sum.laborTravelCost || 0);
          current.afterSalesCount += s._count.id;
          statsMap.set(s.supplierBrand, current);
        }
      });

      engineeringStats.forEach((s) => {
        if (s.supplierName) {
          const current = statsMap.get(s.supplierName) || createEmptyStats();
          current.engineeringLoss += Number(s._sum.lossAmount || 0);
          current.engineeringCount += s._count.id;
          current.engineeringDefectQuantity += s._sum.quantity || 0;
          statsMap.set(s.supplierName, current);
        }
      });

      engineeringStatusStats.forEach((s) => {
        if (!s.supplierName) return;
        if (s.status === 'CLOSED') return;
        const current = statsMap.get(s.supplierName) || createEmptyStats();
        current.openEngineeringCount += s._count.id;
        statsMap.set(s.supplierName, current);
      });

      afterSalesStatusStats.forEach((s) => {
        if (!s.supplierBrand) return;
        if (
          ['CANCELLED', 'CLOSED', 'COMPLETED', 'RESOLVED'].includes(
            s.claimStatus,
          )
        ) {
          return;
        }
        const current = statsMap.get(s.supplierBrand) || createEmptyStats();
        current.openAfterSalesCount += s._count.id;
        statsMap.set(s.supplierBrand, current);
      });

      const supplierRecords: Record<
        string,
        Array<{
          date: Date;
          loss: number;
          origin: 'afterSales' | 'qualityRecords';
          type: 'A' | 'B' | 'C' | null;
        }>
      > = {};

      const combinedRecords = [
        ...recentAfterSales.map((r) => ({
          ...r,
          origin: 'afterSales' as const,
        })),
        ...recentQualityRecords.map((r) => ({
          ...r,
          origin: 'qualityRecords' as const,
        })),
      ];

      combinedRecords.forEach((r) => {
        const name =
          r.origin === 'afterSales' ? r.supplierBrand : r.supplierName;
        if (!name) return;

        let loss = 0;
        let date = new Date();
        if (r.origin === 'afterSales') {
          loss = Number(r.materialCost || 0) + Number(r.laborTravelCost || 0);
          date = new Date(r.occurDate);
        } else {
          loss = Number(r.lossAmount || 0);
          date = new Date(r.date);
        }

        const classification = classifyDefect(loss, r.severity || undefined);
        if (!supplierRecords[name]) supplierRecords[name] = [];
        supplierRecords[name].push({
          type: classification,
          loss,
          date,
          origin: r.origin,
        });
      });

      Object.entries(supplierRecords).forEach(([name, records]) => {
        const current = statsMap.get(name) || createEmptyStats();

        records.sort((a, b) => b.date.getTime() - a.date.getTime());

        let consecutiveCount = 0;
        records.forEach((r) => {
          if (r.loss > current.maxSingleLoss) current.maxSingleLoss = r.loss;
          if (r.origin === 'qualityRecords') {
            if (r.type === 'A') current.engineeringClassA++;
            if (r.type === 'B') current.engineeringClassB++;
            if (r.type === 'C') current.engineeringClassC++;
          } else {
            if (r.type === 'A') current.afterSalesClassA++;
            if (r.type === 'B') current.afterSalesClassB++;
            if (r.type === 'C') current.afterSalesClassC++;
          }

          if (r.type === 'A' || r.type === 'B') {
            consecutiveCount++;
          } else {
            consecutiveCount = 0;
          }
          if (consecutiveCount > current.consecutiveBigFailures) {
            current.consecutiveBigFailures = consecutiveCount;
          }
        });
        statsMap.set(name, current);
      });
    }

    // 5. [Process FULL List for Global Stats]
    const processedFullList = listData.map((item) => {
      const stat = statsMap.get(item.name) || createEmptyStats();
      const incomingPassRate =
        stat.count > 0 ? stat.qualifiedCount / stat.count : 1;
      const incomingQualifiedRate = Math.round(incomingPassRate * 100);
      const totalIssueCount = stat.engineeringCount + stat.afterSalesCount;

      const engineeringDeduction =
        stat.engineeringClassA * 15 +
        stat.engineeringClassB * 5 +
        stat.engineeringClassC * 1;
      const afterSalesDeduction =
        stat.afterSalesClassA * 15 +
        stat.afterSalesClassB * 5 +
        stat.afterSalesClassC * 1;
      const incomingDeduction = stat.failures * 3;
      const totalDeduction =
        engineeringDeduction + afterSalesDeduction + incomingDeduction;

      const incomingScore = clamp100(100 - incomingDeduction);
      const engineeringScore = clamp100(100 - engineeringDeduction);
      const afterSalesScore = clamp100(100 - afterSalesDeduction);
      const stabilityScore = 100;

      let score = Math.round(clamp100(100 - totalDeduction));
      const warningReasons: string[] = [];

      const manualStatus = item.status;
      let finalStatus = manualStatus || 'Qualified';
      if (finalStatus.toLowerCase() === 'qualified') {
        const hasEnoughIssuesForStrictAction =
          totalIssueCount >= LIMIT_MIN_ISSUE_COUNT_FOR_STRICT_ACTION;
        const shouldFreeze =
          hasEnoughIssuesForStrictAction &&
          (stat.consecutiveBigFailures >= LIMIT_CONSECUTIVE_FAILURE ||
            stat.maxSingleLoss > THRESHOLD_CRITICAL_AMOUNT);
        const shouldDowngradeToC =
          stat.engineeringClassA + stat.afterSalesClassA >= 2 ||
          stat.engineeringClassB + stat.afterSalesClassB >= 3 ||
          (stat.count > 5 &&
            incomingQualifiedRate < THRESHOLD_INCOMING_YIELD_WARNING);

        if (shouldFreeze) {
          finalStatus = 'Frozen';
          score = 0;
          warningReasons.push('连续重大问题/单次超大损失');
        } else if (shouldDowngradeToC) {
          finalStatus = 'Observation';
          score = Math.min(score, 70);
          warningReasons.push('累计问题触发C级降级');
        } else if (score < THRESHOLD_SCORE_WARNING) {
          finalStatus = 'Observation';
          score = Math.min(score, 75);
          warningReasons.push('综合分过低');
        } else {
          finalStatus = 'Qualified';
        }
      } else {
        if (finalStatus.toLowerCase() === 'frozen') finalStatus = 'Frozen';
        else if (finalStatus.toLowerCase() === 'observation') {
          finalStatus = 'Observation';
        } else if (finalStatus.toLowerCase() === 'trial') {
          finalStatus = 'Trial';
        }
      }

      let finalRating = 'A';
      if (score >= 90) finalRating = 'A';
      else if (score >= 80) finalRating = 'B';
      else if (score >= 65) finalRating = 'C';
      else finalRating = 'D';

      return {
        ...item,
        incomingBatchCount: stat.count,
        incomingTotalQuantity: stat.quantity,
        incomingQualifiedRate,
        totalAfterSalesLoss: stat.afterSalesLoss,
        totalEngineeringLoss: stat.engineeringLoss,
        engineeringIssueCount: stat.engineeringCount,
        afterSalesIssueCount: stat.afterSalesCount,
        incomingScore: Math.round(incomingScore),
        engineeringScore: Math.round(engineeringScore),
        afterSalesScore: Math.round(afterSalesScore),
        stabilityScore: Math.round(stabilityScore),
        status: finalStatus,
        rating: finalRating,
        level: finalRating,
        isWarning: finalStatus === 'Observation' || finalStatus === 'Frozen',
        warningReasons,
        qualityScore: score,
      };
    });

    interface SupplierListItem extends Record<string, unknown> {
      name: string;
      status: string;
      qualityScore: number;
      [key: string]: unknown;
    }

    // 6. [Dynamic Sorting]
    if (sortBy && sortOrder) {
      (processedFullList as SupplierListItem[]).sort((a, b) => {
        const valA = a[sortBy];
        const valB = b[sortBy];

        if (valA === valB) return 0;

        // Numeric comparison
        if (typeof valA === 'number' && typeof valB === 'number') {
          return sortOrder === 'asc' ? valA - valB : valB - valA;
        }

        // String comparison
        const strA = String(valA || '');
        const strB = String(valB || '');
        return sortOrder === 'asc'
          ? strA.localeCompare(strB)
          : strB.localeCompare(strA);
      });
    }

    // 7. Global Aggregation
    const globalStats = {
      total: totalCount,
      qualified: processedFullList.filter((s) => s.status === 'Qualified')
        .length,
      warning: processedFullList.filter(
        (s) => s.qualityScore < 80 || s.status === 'Observation',
      ).length,
      avgScore: (
        processedFullList.reduce((sum, i) => sum + i.qualityScore, 0) /
        (processedFullList.length || 1)
      ).toFixed(1),
    };

    // 8. Final Pagination
    const finalItems = processedFullList.slice(
      (page - 1) * pageSize,
      page * pageSize,
    );

    return {
      items: finalItems,
      total: totalCount,
      stats: globalStats,
    };
  },
};
