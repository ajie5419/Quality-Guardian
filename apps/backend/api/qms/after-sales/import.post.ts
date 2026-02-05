import { QMS_STATUS_COLOR_MAP } from '@qgs/shared';
import { defineEventHandler, readBody } from 'h3';
import { logApiError } from '~/utils/api-logger';
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
    const { items } = body;

    if (!Array.isArray(items) || items.length === 0) {
      return useResponseError('未选择数据');
    }

    let successCount = 0;
    for (const item of items) {
      try {
        const woNumber = String(item.workOrderNumber || '').trim();
        if (!woNumber) continue;

        // Standardized ID Generation
        const id = `AS-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

        // Validate Status using Shared Constants
        type AfterSalesStatus =
          | 'CANCELLED'
          | 'COMPLETED'
          | 'IN_PROGRESS'
          | 'OPEN';
        let status: AfterSalesStatus = 'OPEN';
        if (
          item.status &&
          QMS_STATUS_COLOR_MAP[item.status as keyof typeof QMS_STATUS_COLOR_MAP]
        ) {
          // If the status key itself is passed (e.g. IN_PROGRESS)
          status = item.status as AfterSalesStatus;
        }

        await prisma.after_sales.create({
          data: {
            id,
            serialNumber: Math.floor(Math.random() * 1_000_000),
            occurDate: new Date(item.issueDate || item.occurDate || Date.now()),
            claimStatus: status,
            projectName: String(item.projectName || ''),
            customerName: String(item.customerName || ''),
            workOrderNumber: woNumber,
            issueDescription: String(item.issueDescription || ''),
            quantity: Number(item.quantity) || 1,
            isDeleted: false,
          },
        });
        successCount++;
      } catch (error) {
        logApiError('import', error);
      }
    }

    return useResponseSuccess({ successCount, totalCount: items.length });
  } catch {
    return useResponseError('导入异常');
  }
});
