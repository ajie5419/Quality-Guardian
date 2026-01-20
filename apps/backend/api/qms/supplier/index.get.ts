import { defineEventHandler, getQuery } from 'h3';
import prisma from '~/utils/prisma';
import { useResponseSuccess } from '~/utils/response';

export default defineEventHandler(async (event) => {
  try {
    const query = getQuery(event);

    // 1. 规范化分页与排序参数 (严格对齐文档)
    const pageRaw = Array.isArray(query.page) ? query.page[0] : query.page;
    const pageSizeRaw = Array.isArray(query.pageSize)
      ? query.pageSize[0]
      : query.pageSize;
    const sortByRaw = Array.isArray(query.sortBy)
      ? query.sortBy[0]
      : query.sortBy;
    const sortOrderRaw = Array.isArray(query.sortOrder)
      ? query.sortOrder[0]
      : query.sortOrder;

    const page = Math.max(1, Number.parseInt(String(pageRaw ?? '1')) || 1);
    const pageSize = Math.max(
      1,
      Number.parseInt(String(pageSizeRaw ?? '20')) || 20,
    );
    const sortBy = sortByRaw as string;
    const sortOrder = (sortOrderRaw as string) || 'desc';
    const category = query.category as string;

    // 2. 获取基础供应商列表 (全量拉取用于全局排序)
    const whereCondition: Record<string, unknown> = { isDeleted: false };
    if (category) {
      whereCondition.category = { contains: category.trim() };
    }

    const [allSuppliers, totalCount] = await Promise.all([
      prisma.suppliers.findMany({
        where: whereCondition,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.suppliers.count({ where: whereCondition }),
    ]);

    if (allSuppliers.length === 0) {
      return useResponseSuccess({
        items: [],
        total: 0,
        stats: { total: 0, qualified: 0, warning: 0, avgScore: 0 },
      });
    }

    // 3. 批量拉取业务数据
    const supplierNames = allSuppliers.map((s) => s.name.trim());
    const supplierBrands = allSuppliers
      .map((s) => s.brand?.trim())
      .filter(Boolean) as string[];
    const allKeywords = [...new Set([...supplierBrands, ...supplierNames])];

    const [allInspections, allAfterSales, allEngineeringIssues] =
      await Promise.all([
        prisma.inspections.findMany({
          where: {
            supplierName: { in: allKeywords },
            category: 'INCOMING',
            isDeleted: false,
          },
          select: { supplierName: true, quantity: true },
        }),
        prisma.after_sales.findMany({
          where: {
            OR: [
              { supplierBrand: { in: allKeywords } },
              { projectName: { in: allKeywords } },
            ],
            isDeleted: false,
          },
          select: { supplierBrand: true, projectName: true, qualityLoss: true },
        }),
        prisma.quality_records.findMany({
          where: { supplierName: { in: allKeywords }, isDeleted: false },
          select: { supplierName: true, quantity: true, lossAmount: true },
        }),
      ]);

    // 4. 计算动态评分与等级 (Enrich Data)
    const listData = allSuppliers.map((supplier) => {
      const name = supplier.name.trim().toLowerCase();
      const brand = supplier.brand?.trim().toLowerCase();
      const isMatch = (val: null | string | undefined) => {
        if (!val) return false;
        const v = val.trim().toLowerCase();
        return v === name || (brand && v === brand);
      };

      const myInspections = allInspections.filter((i) =>
        isMatch(i.supplierName),
      );
      const incomingTotalQty = myInspections.reduce(
        (acc, i) => acc + (Number(i.quantity) || 0),
        0,
      );
      const myEngIssues = allEngineeringIssues.filter((ei) =>
        isMatch(ei.supplierName),
      );
      const engDefectQty = myEngIssues.reduce(
        (acc, ei) => acc + (Number(ei.quantity) || 0),
        0,
      );
      const totalEngLoss = myEngIssues.reduce(
        (acc, ei) => acc + (Number(ei.lossAmount) || 0),
        0,
      );
      const myAfterSales = allAfterSales.filter(
        (as) => isMatch(as.supplierBrand) || isMatch(as.projectName),
      );
      const totalAsLoss = myAfterSales.reduce(
        (acc, as) => acc + (Number(as.qualityLoss) || 0),
        0,
      );

      const qualifiedRate =
        incomingTotalQty > 0
          ? (Math.max(0, incomingTotalQty - engDefectQty) / incomingTotalQty) *
            100
          : 100;

      let dynamicScore =
        100 - myEngIssues.length * 8 - myAfterSales.length * 10;
      dynamicScore -= (100 - qualifiedRate) * 2;
      if (dynamicScore < 0) dynamicScore = 0;

      let level = 'A';
      if (dynamicScore < 70) level = 'D';
      else if (dynamicScore < 80) level = 'C';
      else if (dynamicScore < 90) level = 'B';

      const isWarning = dynamicScore < 80;
      const warningReasons = [];
      if (dynamicScore < 60) warningReasons.push('综合评分极低');
      if (qualifiedRate < 85) warningReasons.push('进货合格率低于阈值');
      if (myAfterSales.length > 0) warningReasons.push('存在重大售后索赔');

      let displayStatus = supplier.status;
      if (dynamicScore < 60) displayStatus = 'Frozen';
      else if (dynamicScore < 80 && supplier.status === 'Qualified')
        displayStatus = 'Observation';

      return {
        ...supplier,
        status: displayStatus,
        qualityScore: Math.round(dynamicScore),
        level,
        isWarning,
        warningReasons,
        incomingQualifiedRate: Number.parseFloat(qualifiedRate.toFixed(1)),
        engineeringIssueCount: myEngIssues.length,
        totalEngineeringLoss: totalEngLoss,
        afterSalesIssueCount: myAfterSales.length,
        totalAfterSalesLoss: totalAsLoss,
        incomingBatchCount: myInspections.length,
        incomingTotalQuantity: incomingTotalQty,
      };
    });

    // 5. 核心排序逻辑 (去除 hasOwnProperty 限制，增加对动态字段的显式支持)
    if (sortBy) {
      const isDesc = sortOrder === 'desc';

      listData.sort((a, b) => {
        const aRecord = a as Record<string, unknown>;
        const bRecord = b as Record<string, unknown>;
        const aValue = aRecord[sortBy];
        const bValue = bRecord[sortBy];

        // 如果该字段不存在，则不改变顺序
        if (aValue === undefined || bValue === undefined) return 0;

        let result = 0;
        if (typeof aValue === 'number' && typeof bValue === 'number') {
          result = aValue - bValue;
        } else if (aValue instanceof Date && bValue instanceof Date) {
          result = aValue.getTime() - bValue.getTime();
        } else if (typeof aValue === 'boolean' && typeof bValue === 'boolean') {
          if (aValue === bValue) {
            result = 0;
          } else {
            result = aValue ? 1 : -1;
          }
        } else {
          const aStr = String(aValue ?? '');
          const bStr = String(bValue ?? '');
          const aNum = Number(aStr);
          const bNum = Number(bStr);
          result =
            Number.isFinite(aNum) && Number.isFinite(bNum)
              ? aNum - bNum
              : aStr.localeCompare(bStr, undefined, {
                  numeric: true,
                  sensitivity: 'base',
                });
        }
        return isDesc ? -result : result;
      });
    }

    // 6. 全局统计
    const stats = {
      total: listData.length,
      qualified: listData.filter(
        (s) => s.qualityScore >= 80 && s.status !== 'Frozen',
      ).length,
      warning: listData.filter((s) => s.isWarning).length,
      avgScore: (
        listData.reduce((acc, s) => acc + s.qualityScore, 0) /
        (listData.length || 1)
      ).toFixed(1),
    };

    // 7. 分页截取 (排序之后截取)
    const pagedItems = listData.slice((page - 1) * pageSize, page * pageSize);

    return useResponseSuccess({ items: pagedItems, stats, total: totalCount });
  } catch (error: unknown) {
    console.error('Supplier API Error:', error);
    const err = error as { message?: string };
    return { code: -1, message: `数据加载失败: ${err.message}` };
  }
});
