import {
  defineEventHandler,
  getRouterParam,
  readBody,
  setResponseStatus,
} from 'h3';
import { SystemLogService } from '~/services/system-log.service';
import { mapAfterSalesStatus } from '~/utils/after-sales-status';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import {
  unAuthorizedResponse,
  useResponseError,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  const id = getRouterParam(event, 'id');
  if (!id) {
    setResponseStatus(event, 400);
    return useResponseError('缺少ID');
  }

  try {
    const body = await readBody(event);
    const bodyRecord = body as Record<string, unknown>;

    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    // Map fields
    if (bodyRecord.issueDate)
      updateData.occurDate = new Date(bodyRecord.issueDate as string);
    if (bodyRecord.responsibleDept) {
      updateData.respDept = bodyRecord.responsibleDept;
      updateData.feedbackDept = bodyRecord.responsibleDept;
    }
    if (bodyRecord.resolutionPlan)
      updateData.solution = bodyRecord.resolutionPlan;
    if (bodyRecord.status) {
      const status = bodyRecord.status as string;
      updateData.claimStatus = mapAfterSalesStatus(status);
    }

    // Map other fields
    const fields = [
      'workOrderNumber',
      'projectName',
      'customerName',
      'location',
      'productType',
      'productSubtype',
      'warrantyStatus',
      'issueDescription',
      'handler',
      'defectType',
      'defectSubtype',
      'severity',
      'division',
      'isClaim',
      'supplierBrand',
      'partName',
      'photos',
    ];
    fields.forEach((f) => {
      if (bodyRecord[f] !== undefined) {
        updateData[f] =
          f === 'photos' && Array.isArray(bodyRecord[f])
            ? JSON.stringify(bodyRecord[f])
            : bodyRecord[f];
      }
    });

    if (bodyRecord.quantity !== undefined)
      updateData.quantity = Number(bodyRecord.quantity);
    if (bodyRecord.materialCost !== undefined)
      updateData.materialCost = Number(bodyRecord.materialCost);
    if (bodyRecord.laborTravelCost !== undefined)
      updateData.laborTravelCost = Number(bodyRecord.laborTravelCost);
    if (bodyRecord.runningHours !== undefined)
      updateData.runningHours = Number(bodyRecord.runningHours);
    if (bodyRecord.factoryDate)
      updateData.factoryDate = new Date(bodyRecord.factoryDate as string);
    if (bodyRecord.closeDate)
      updateData.closeDate = new Date(bodyRecord.closeDate as string);

    await prisma.after_sales.update({
      where: { id },
      data: updateData,
    });

    await SystemLogService.recordAuditLog({
      userId: String(userinfo.id),
      action: 'UPDATE',
      targetType: 'after_sales',
      targetId: String(id),
      details: `修改售后记录: ${id}`,
    });

    return useResponseSuccess(null);
  } catch (error) {
    logApiError('after-sales', error);
    setResponseStatus(event, 500);
    return useResponseError('更新售后记录失败');
  }
});
