import { after_sales_claimStatus } from '@prisma/client';
import { QMS_DEFAULT_VALUES } from '@qgs/shared';
import { defineEventHandler, readBody } from 'h3';
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
  const userinfo = await verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  try {
    const body = await readBody(event);

    const claimStatus = mapAfterSalesStatus(body.status);

    const newItem = await prisma.after_sales.create({
      data: {
        id: `AS-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
        serialNumber: Math.floor(Date.now() / 1000), // Use seconds to fit INT
        workOrderNumber:
          body.workOrderNumber || QMS_DEFAULT_VALUES.UNKNOWN_WORK_ORDER,
        projectName: body.projectName || '',
        customerName: body.customerName,
        location: body.location,
        productType: body.productType,
        productSubtype: body.productSubtype,

        occurDate: new Date(body.issueDate || Date.now()),
        factoryDate: body.factoryDate ? new Date(body.factoryDate) : null,
        closeDate: body.closeDate ? new Date(body.closeDate) : null,

        warrantyStatus: body.warrantyStatus,
        issueDescription: body.issueDescription,
        quantity: Number(body.quantity) || 1,

        respDept: body.responsibleDept,
        feedbackDept: body.responsibleDept, // Map duplicate?

        solution: body.resolutionPlan,
        handler: body.handler,

        materialCost: Number(body.materialCost) || 0,
        laborTravelCost: Number(body.laborTravelCost) || 0,
        qualityLoss:
          (Number(body.materialCost) || 0) +
          (Number(body.laborTravelCost) || 0), // Calc total loss

        claimStatus: claimStatus as after_sales_claimStatus,

        defectType: body.defectType,
        defectSubtype: body.defectSubtype,
        severity: body.severity,
        runningHours: Number(body.runningHours),
        division: body.division,
        partName: body.partName,
        supplierBrand: body.supplierBrand || null,
        isClaim: body.isClaim || false,
        photos: body.photos ? JSON.stringify(body.photos) : null,

        isDeleted: false,
        updatedAt: new Date(),
      },
    });

    return useResponseSuccess(newItem);
  } catch (error: unknown) {
    logApiError('after-sales-create', error);
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    return useResponseError(`创建售后记录失败: ${errorMessage}`);
  }
});
