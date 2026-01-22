import { defineEventHandler, getQuery } from 'h3';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import { unAuthorizedResponse, useResponseSuccess } from '~/utils/response';

export default defineEventHandler(async (event) => {
  const userinfo = await verifyAccessToken(event);
  if (!userinfo) return unAuthorizedResponse(event);

  try {
    const query = getQuery(event);

    // 1. 鲁棒性参数提取
    const getSafe = (val: any) => {
      const s = String(Array.isArray(val) ? val[0] : (val ?? '')).trim();
      if (!s || s === 'undefined' || s === 'null' || s === '[object Object]')
        return undefined;
      return s;
    };

    const type = getSafe(query.type);
    const workOrderNumber = getSafe(query.workOrderNumber);
    const projectName = getSafe(query.projectName);
    const startDate = getSafe(query.startDate);
    const endDate = getSafe(query.endDate);
    const year = getSafe(query.year);

    // 2. 映射检验类型到数据库分类
    let categoryFilter: any;
    const typeFilter = (type || '').toUpperCase();
    switch (typeFilter) {
      case 'INCOMING': {
        categoryFilter = 'INCOMING';
        break;
      }
      case 'OUTGOING':
      case 'SHIPMENT': {
        categoryFilter = 'OUTGOING';
        break;
      }
      case 'PROCESS': {
        categoryFilter = 'PROCESS';
        break;
      }
    }

    // 3. 构造稳健的查询对象
    const where: any = { isDeleted: false };
    if (categoryFilter) where.category = categoryFilter;
    if (workOrderNumber) where.workOrderNumber = { contains: workOrderNumber };
    if (projectName) where.projectName = { contains: projectName };

    // 4. 日期范围过滤
    if (startDate && endDate) {
      const sDate = new Date(startDate);
      const eDate = new Date(`${endDate}T23:59:59.999Z`);
      if (!Number.isNaN(sDate.getTime()) && !Number.isNaN(eDate.getTime())) {
        where.date = { gte: sDate, lte: eDate };
      }
    } else if (year) {
      const y = Number.parseInt(year);
      if (!Number.isNaN(y)) {
        where.date = {
          gte: new Date(`${y}-01-01T00:00:00.000Z`),
          lte: new Date(`${y}-12-31T23:59:59.999Z`),
        };
      }
    }

    // 5. 执行查询
    const records = await prisma.inspections.findMany({
      where,
      orderBy: { date: 'desc' },
      include: {
        work_orders: { select: { customerName: true } },
      },
    });

    // 6. 安全的数据映射 (防御 null 崩溃)
    const data = records.map((item: any) => {
      let results = [];
      try {
        if (item.details) {
          const parsed = JSON.parse(item.details);
          if (Array.isArray(parsed)) results = parsed;
        }
      } catch {}

      return {
        ...item,
        results,
        reportDate:
          item.date instanceof Date
            ? item.date.toISOString().split('T')[0]
            : '',
        result: String(item.result || 'PASS').toUpperCase(),
        materialName: item.itemName || item.partName || '-',
        hasDocuments: item.shippingDocs || '无',
        componentName: item.partName || '-',
        process: item.processName || '-',
        archived: item.isArchived ? '是' : '否',
        customerName: item.work_orders?.customerName || '-',
      };
    });

    return useResponseSuccess(data);
  } catch (error: any) {
    console.error('Inspection Records API Error:', error);
    return useResponseSuccess([]);
  }
});
