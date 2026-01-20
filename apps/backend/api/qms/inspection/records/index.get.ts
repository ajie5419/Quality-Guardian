import { defineEventHandler, getQuery } from 'h3';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import { unAuthorizedResponse, useResponseSuccess } from '~/utils/response';

export default defineEventHandler(async (event) => {
  const userinfo = await verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  const { supplierName, type, year } = getQuery(event);

  let categoryFilter: string | undefined;
  const typeFilter: string = String(type || '').toUpperCase();

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

  // 年份过滤逻辑
  let dateFilter: Record<string, Date> | undefined;
  if (year) {
    const y = Number.parseInt(String(year));
    if (!Number.isNaN(y)) {
      dateFilter = {
        gte: new Date(`${y}-01-01T00:00:00.000Z`),
        lte: new Date(`${y}-12-31T23:59:59.999Z`),
      };
    }
  }

  try {
    // 如果提供了供应商名称，我们需要查询其全名和品牌，以确保获取全量履历
    const supplierKeywords: string[] = [];
    if (supplierName) {
      const sName = String(supplierName);
      supplierKeywords.push(sName);

      // 尝试查找对应的供应商信息，获取其品牌名
      const supplier = await prisma.suppliers.findFirst({
        where: { OR: [{ name: sName }, { brand: sName }] },
      });
      if (supplier) {
        if (supplier.name && !supplierKeywords.includes(supplier.name))
          supplierKeywords.push(supplier.name);
        if (supplier.brand && !supplierKeywords.includes(supplier.brand))
          supplierKeywords.push(supplier.brand);
      }
    }

    const records = await prisma.inspections.findMany({
      where: {
        isDeleted: false,
        ...(categoryFilter ? { category: categoryFilter as any } : {}),
        ...(supplierKeywords.length > 0
          ? { supplierName: { in: supplierKeywords } }
          : {}),
        ...(dateFilter ? { date: dateFilter } : {}), // 应用年份过滤
      },
      orderBy: { createdAt: 'desc' },
    });

    const data = records.map((item) => {
      let results = [];
      if (item.details) {
        try {
          const parsed = JSON.parse(item.details);
          if (Array.isArray(parsed)) results = parsed;
        } catch {}
      }

      return {
        ...item,
        results,
        reportDate: item.date.toISOString().split('T')[0],
        result: String(item.result || 'PASS').toUpperCase(),
        materialName: item.itemName,
        hasDocuments: item.shippingDocs,
        componentName: item.partName,
        process: item.processName,
        level1Component: item.firstLevelPartName,
        documents: item.shippingDocs,
        archived: item.isArchived ? '是' : '否',
        packingListArchived: item.isArchived ? '是' : '否',
      };
    });

    return useResponseSuccess(data);
  } catch (error) {
    console.error('Fetch detailed inspection records failed', error);
    return useResponseSuccess([]);
  }
});
