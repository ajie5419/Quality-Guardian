import { defineEventHandler, getQuery } from 'h3';
import { logApiError } from '~/utils/api-logger';
import prisma from '~/utils/prisma';
import { useResponseSuccess } from '~/utils/response';

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
    // Support both 'keyword' (from SupplierSelect) and 'name' (legacy)
    const keyword = getSafe(query.keyword) || getSafe(query.name);

    // 2. 构造极其稳健的过滤条件
    const where: any = { isDeleted: false };

    // 2.1 分类过滤 logic (Category Logic)
    if (category) {
      const cat = category.toLowerCase();
      if (cat === 'supplier' || cat === 'productionunit') {
        // 供应商或生产单位：排除外协单位
        // 因为数据库中目前只存了 Supplier 和 Outsourcing，
        // 所以生产单位（ProductionUnit）被视为普通供应商处理，
        // 关键是把它和“外协”区分开。
        where.NOT = {
          category: { contains: 'Outsourcing' },
        };
      } else if (cat === 'outsourcing') {
        // 外协单位
        where.category = { contains: 'Outsourcing' };
      } else {
        where.category = { contains: category };
      }
    }

    // 2.2 状态过滤
    if (statusFilter) where.status = statusFilter;

    // 2.3 综合关键词搜索 (Keyword Search - mimicking WorkOrderService)
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

    // 4. 安全的数据映射 (防止 null 崩溃)
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

    // 5. 分页处理
    const pagedItems = listData.slice((page - 1) * pageSize, page * pageSize);

    // 6. 返回结果 (包含默认统计信息以适配前端)
    return useResponseSuccess({
      items: pagedItems,
      total: totalCount,
      stats: {
        total: totalCount,
        qualified: listData.filter((s) => s.status === 'Qualified').length,
        warning: listData.filter((s) => (s.qualityScore || 0) < 80).length,
        avgScore: '100',
      },
    });
  } catch (error: any) {
    logApiError('supplier', error);
    return useResponseSuccess({ items: [], total: 0, stats: { total: 0 } });
  }
});
