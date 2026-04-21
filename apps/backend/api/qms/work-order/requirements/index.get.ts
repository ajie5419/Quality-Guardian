import { defineEventHandler, getQuery } from 'h3';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import {
  badRequestResponse,
  internalServerErrorResponse,
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';
import { parseRequirementAttachments } from '~/utils/work-order-requirement-attachments';

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) return unAuthorizedResponse(event);

  const query = getQuery(event);
  const workOrderNumber = String(query.workOrderNumber || '').trim();
  if (!workOrderNumber) {
    return badRequestResponse(event, '工单号不能为空');
  }

  try {
    const list = await prisma.work_order_requirements.findMany({
      where: {
        isDeleted: false,
        status: 'active',
        workOrderNumber,
      },
      orderBy: [{ updatedAt: 'desc' }],
      select: {
        attachment: true,
        confirmer: true,
        confirmedAt: true,
        confirmStatus: true,
        createdAt: true,
        id: true,
        partName: true,
        processName: true,
        requirementItems: true,
        requirementName: true,
        responsiblePerson: true,
        responsibleTeam: true,
        workOrderNumber: true,
      },
    });

    return useResponseSuccess(
      list.map((item) => ({
        attachments: parseRequirementAttachments(item.attachment),
        confirmer: item.confirmer || '',
        confirmedAt: item.confirmedAt,
        confirmStatus: item.confirmStatus || 'PENDING',
        createdAt: item.createdAt,
        id: item.id,
        items: parseRequirementItems(item.requirementItems),
        partName: item.partName || '',
        processName: item.processName || '',
        requirementName: item.requirementName || '',
        responsiblePerson: item.responsiblePerson || '',
        responsibleTeam: item.responsibleTeam || '',
        workOrderNumber: item.workOrderNumber,
      })),
    );
  } catch (error) {
    logApiError('work-order-requirement-list', error);
    return internalServerErrorResponse(event, '获取工单要求失败');
  }
});

function parseRequirementItems(value?: null | string) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
