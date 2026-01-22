import { defineEventHandler, readBody } from 'h3';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import {
  unAuthorizedResponse,
  useResponseError,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  const userinfo = await verifyAccessToken(event);
  if (!userinfo) return unAuthorizedResponse(event);

  try {
    const body = await readBody(event);
    const { items, type } = body;

    if (!Array.isArray(items) || items.length === 0) {
      return useResponseError('未选择数据');
    }

    let successCount = 0;
    for (const item of items) {
      try {
        const woNumber = String(item.workOrderNumber || '').trim();
        if (!woNumber) continue;

        const id = `INS-${Date.now()}-${Math.random().toString(36).slice(-4)}`;

        const record = {
          id,
          serialNumber: Math.floor(Math.random() * 1_000_000),
          date: new Date(item.reportDate || Date.now()),
          category: (type || 'INCOMING').toUpperCase() as any,
          result: String(item.result || 'PASS').toUpperCase() as any,
          inspector: String(item.inspector || 'Admin'),
          quantity: Number(item.quantity) || 1,
          workOrderNumber: woNumber,
          projectName: String(item.projectName || ''),
          supplierName: String(item.supplierName || ''),
          itemName: String(item.materialName || item.itemName || ''),
          processName: String(item.process || item.processName || ''),
          isDeleted: false,
        };

        await prisma.inspections.create({ data: record });
        successCount++;
      } catch (error) {
        console.error('Import item error:', error);
      }
    }

    return useResponseSuccess({ successCount, totalCount: items.length });
  } catch {
    return useResponseError('导入异常');
  }
});
