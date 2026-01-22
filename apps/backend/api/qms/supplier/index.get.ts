import { defineEventHandler, getQuery } from 'h3';
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
    const nameFilter = getSafe(query.name);
    const statusFilter = getSafe(query.status);

    // 2. 构造极其稳健的过滤条件
    const where: any = { isDeleted: false };

    if (category) {
      const cat = category.toLowerCase();
      if (cat === 'supplier') {
        // 供应商：显示所有非明确标记为外协的数据（包含分类为空的数据）
        where.NOT = { category: { contains: 'outsourcing' } };
      } else if (cat === 'outsourcing') {
        // 外协单位：只显示包含关键字的数据
        where.category = { contains: 'outsourcing' };
      } else {
        where.category = { contains: category };
      }
    }

    if (nameFilter) where.name = { contains: nameFilter };
    if (statusFilter) where.status = statusFilter;

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
    console.error('Supplier List API Error:', error);
    return useResponseSuccess({ items: [], total: 0, stats: { total: 0 } });
  }
});
