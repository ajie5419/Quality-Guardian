import { defineEventHandler, getQuery } from 'h3';
import { logApiError } from '~/utils/api-logger';
import prisma from '~/utils/prisma';
import { useResponseSuccess } from '~/utils/response';

// --- Scoring Constants (Configurable) ---
const THRESHOLD_CLASS_A_AMOUNT = 5000; // Class A: Loss > 5000
const THRESHOLD_CRITICAL_AMOUNT = 80_000; // Blacklist: Loss > 80000
const THRESHOLD_INCOMING_YIELD_WARNING = 90; // Downgrade: Yield < 90% (if > 5 batches)

const SCORE_DEDUCTION_CLASS_A = 15;
const SCORE_DEDUCTION_CLASS_B = 5;
const SCORE_DEDUCTION_CLASS_C = 1;

const SCORE_DEDUCTION_INCOMING_FAIL = 3; // Per failed batch

const LIMIT_CONSECUTIVE_FAILURE = 3; // 3x Consecutive A/B -> Blacklist
const LIMIT_YEARLY_CLASS_A = 2; // 2x Class A -> Downgrade
const LIMIT_YEARLY_CLASS_B = 3; // 3x Class B -> Downgrade

export default defineEventHandler(async (event) => {
  try {
    const query = getQuery(event);

    // 1. 规范化参数 (防御所有非法输入)
    const getSafe = (val: any) => {
      const s = String(Array.isArray(val) ? val[0] : (val ?? '')).trim();
      if (!s || s === 'undefined' || s === 'null' || s === '[object Object]')
        return undefined;
      return s;
    };

    const page = Math.max(1, Number.parseInt(String(query.page || '1')) || 1);
    const pageSize = Math.max(
      1,
      Number.parseInt(String(query.pageSize || '20')) || 20,
    );
    const category = getSafe(query.category);
    const statusFilter = getSafe(query.status);
    const keyword = getSafe(query.keyword) || getSafe(query.name);
    const sortBy = getSafe(query.sortBy);
    const sortOrder = getSafe(query.sortOrder) as 'asc' | 'desc' | undefined;

    // 2. 构造极其稳健的过滤条件
    const where: any = { isDeleted: false };
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
    if (statusFilter) where.status = statusFilter;
    if (keyword) {
      where.OR = [
        { name: { contains: keyword } },
        { contact: { contains: keyword } },
        { email: { contains: keyword } },
        { phone: { contains: keyword } },
      ];
    }

    // 3. 执行核心查询
    const [rawItems, totalCount] = await Promise.all([
      prisma.suppliers.findMany({
        where,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.suppliers.count({ where }),
    ]);

    // 4. 安全的数据映射
    const listData = rawItems.map((item: any) => ({
      ...item,
      qualityScore: item.qualityScore ?? 100,
      level: item.rating || 'A',
      status: item.status || 'Qualified',
      createdAt:
        item.createdAt instanceof Date ? item.createdAt.toISOString() : null,
      updatedAt:
        item.updatedAt instanceof Date ? item.updatedAt.toISOString() : null,
    }));

    // 5. [Move Statistics Aggregation Before Slicing]
    // Get ALL supplier names to calculate global stats
    const supplierNames = listData.map((i) => i.name).filter(Boolean);
    const statsMap = new Map<
      string,
      {
        afterSalesCount: number;
        afterSalesLoss: number;
        classA: number;
        classB: number;
        classC: number;
        consecutiveBigFailures: number;
        count: number;
        engineeringCount: number;
        engineeringDefectQuantity: number;
        engineeringLoss: number;
        failures: number;
        failuresQuantity: number;
        maxSingleLoss: number;
        qualifiedCount: number;
        quantity: number;
      }
    >();

    const now = new Date();
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(now.getFullYear() - 1);

    if (supplierNames.length > 0) {
      const [
        incomingStats,
        afterSalesStats,
        engineeringStats,
        recentAfterSales,
        recentQualityRecords,
      ] = await Promise.all([
        prisma.inspections.groupBy({
          by: ['supplierName', 'result'],
          where: {
            supplierName: { in: supplierNames },
            category: 'INCOMING',
            isDeleted: false,
          },
          _count: { id: true },
          _sum: { quantity: true },
        }),
        prisma.after_sales.groupBy({
          by: ['supplierBrand'],
          where: {
            supplierBrand: { in: supplierNames },
            isDeleted: false,
          },
          _sum: { materialCost: true, laborTravelCost: true },
          _count: { id: true },
        }),
        prisma.quality_records.groupBy({
          by: ['supplierName'],
          where: {
            supplierName: { in: supplierNames },
            isDeleted: false,
          },
          _sum: { lossAmount: true, quantity: true },
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
        if (['critical', 'p0', 'p1'].includes(sev)) return 'A';
        if (['high', 'major', 'p2'].includes(sev)) return 'B';
        if (['low', 'minor', 'p3'].includes(sev)) return 'C';
        return null;
      };

      incomingStats.forEach((s) => {
        if (s.supplierName) {
          const current = statsMap.get(s.supplierName) || {
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
            classA: 0,
            classB: 0,
            classC: 0,
            consecutiveBigFailures: 0,
            maxSingleLoss: 0,
          };
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
          const current = statsMap.get(s.supplierBrand) || {
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
            classA: 0,
            classB: 0,
            classC: 0,
            consecutiveBigFailures: 0,
            maxSingleLoss: 0,
          };
          current.afterSalesLoss +=
            Number(s._sum.materialCost || 0) +
            Number(s._sum.laborTravelCost || 0);
          current.afterSalesCount += s._count.id;
          statsMap.set(s.supplierBrand, current);
        }
      });

      engineeringStats.forEach((s) => {
        if (s.supplierName) {
          const current = statsMap.get(s.supplierName) || {
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
            classA: 0,
            classB: 0,
            classC: 0,
            consecutiveBigFailures: 0,
            maxSingleLoss: 0,
          };
          current.engineeringLoss += Number(s._sum.lossAmount || 0);
          current.engineeringCount += s._count.id;
          current.engineeringDefectQuantity += s._sum.quantity || 0;
          statsMap.set(s.supplierName, current);
        }
      });

      const supplierRecords: Record<
        string,
        Array<{ date: Date; loss: number; type: 'A' | 'B' | 'C' | null }>
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
        supplierRecords[name].push({ type: classification, loss, date });
      });

      Object.entries(supplierRecords).forEach(([name, records]) => {
        const current = statsMap.get(name) || {
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
          classA: 0,
          classB: 0,
          classC: 0,
          consecutiveBigFailures: 0,
          maxSingleLoss: 0,
        };

        records.sort((a, b) => b.date.getTime() - a.date.getTime());

        let consecutiveCount = 0;
        records.forEach((r) => {
          if (r.loss > current.maxSingleLoss) current.maxSingleLoss = r.loss;
          if (r.type === 'A') current.classA++;
          if (r.type === 'B') current.classB++;
          if (r.type === 'C') current.classC++;

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

    // 6. [Process FULL List for Global Stats]
    const processedFullList = listData.map((item) => {
      const stat = statsMap.get(item.name) || {
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
        classA: 0,
        classB: 0,
        classC: 0,
        consecutiveBigFailures: 0,
        maxSingleLoss: 0,
      };

      let rate = 100;
      if (stat.quantity > 0) {
        const totalDefectQty =
          stat.failuresQuantity + stat.engineeringDefectQuantity;
        const qualifiedQty = Math.max(0, stat.quantity - totalDefectQty);
        rate = Math.round((qualifiedQty / stat.quantity) * 100);
      }

      let calculatedStatus = 'Qualified';
      let calculatedRating = 'A';
      let score = 100;

      const deductionAccidents =
        stat.classA * SCORE_DEDUCTION_CLASS_A +
        stat.classB * SCORE_DEDUCTION_CLASS_B +
        stat.classC * SCORE_DEDUCTION_CLASS_C;

      const deductionIncoming = stat.failures * SCORE_DEDUCTION_INCOMING_FAIL;

      score = Math.max(0, 100 - deductionAccidents - deductionIncoming);

      if (
        stat.consecutiveBigFailures >= LIMIT_CONSECUTIVE_FAILURE ||
        stat.maxSingleLoss > THRESHOLD_CRITICAL_AMOUNT
      ) {
        calculatedStatus = 'frozen';
        calculatedRating = 'D';
        score = 0;
      } else {
        let shouldDowngrade = false;
        if (
          stat.classA >= LIMIT_YEARLY_CLASS_A ||
          stat.classB >= LIMIT_YEARLY_CLASS_B
        ) {
          shouldDowngrade = true;
        }
        if (stat.count >= 5 && rate < THRESHOLD_INCOMING_YIELD_WARNING) {
          shouldDowngrade = true;
        }

        if (shouldDowngrade) {
          calculatedStatus = 'observation';
          calculatedRating = 'C';
          score = Math.min(score, 70);
        } else {
          if (stat.classA > 0 || stat.classB > 0 || score < 90) {
            calculatedRating = 'B';
            calculatedStatus = 'Qualified';
          }
        }
      }

      return {
        ...item,
        incomingBatchCount: stat.count,
        incomingTotalQuantity: stat.quantity,
        incomingQualifiedRate: rate,
        totalAfterSalesLoss: stat.afterSalesLoss,
        totalEngineeringLoss: stat.engineeringLoss,
        engineeringIssueCount: stat.engineeringCount,
        afterSalesIssueCount: stat.afterSalesCount,
        status: calculatedStatus,
        rating: calculatedRating,
        level: calculatedRating,
        qualityScore: score,
      };
    });

    // 7. [Dynamic Sorting]
    if (sortBy && sortOrder) {
      processedFullList.sort((a: any, b: any) => {
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

    // 8. Global Aggregation
    const globalStats = {
      total: totalCount,
      qualified: processedFullList.filter((s) => s.status === 'Qualified')
        .length,
      warning: processedFullList.filter(
        (s) => s.qualityScore < 80 || s.status === 'observation',
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

    return useResponseSuccess({
      items: finalItems,
      total: totalCount,
      stats: globalStats,
    });
  } catch (error: any) {
    logApiError('supplier', error);
    return useResponseSuccess({ items: [], total: 0, stats: { total: 0 } });
  }
});
