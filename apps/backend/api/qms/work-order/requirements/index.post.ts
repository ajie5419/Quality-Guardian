import { defineEventHandler, readBody } from 'h3';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import {
  badRequestResponse,
  internalServerErrorResponse,
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';

type RequirementPayload = {
  attachment?: string;
  items?: unknown[];
  partName?: string;
  processName?: string;
  requirementName?: string;
  responsiblePerson?: string;
  responsibleTeam?: string;
  workOrderNumber?: string;
};

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) return unAuthorizedResponse(event);

  try {
    const body = (await readBody(event)) as RequirementPayload & {
      requirements?: RequirementPayload[];
    };
    const requirements = Array.isArray(body.requirements)
      ? body.requirements
      : [body];

    if (requirements.length === 0) {
      return badRequestResponse(event, '至少上传一条要求');
    }

    const normalized = requirements.map((item) => ({
      attachment: String(item.attachment || '').trim() || null,
      items: Array.isArray(item.items) ? item.items : [],
      partName: String(item.partName || '').trim() || null,
      processName: String(item.processName || '').trim() || null,
      requirementName: String(item.requirementName || '').trim(),
      responsiblePerson: String(item.responsiblePerson || '').trim() || null,
      responsibleTeam: String(item.responsibleTeam || '').trim() || null,
      workOrderNumber: String(item.workOrderNumber || '').trim(),
    }));

    for (const item of normalized) {
      if (!item.workOrderNumber || !item.requirementName) {
        return badRequestResponse(event, '工单号和要求名称不能为空');
      }
    }

    const created = await prisma.$transaction(
      normalized.map((item) =>
        prisma.work_order_requirements.create({
          data: {
            attachment: item.attachment,
            createdBy: userinfo.username,
            partName: item.partName,
            processName: item.processName,
            requirementItems: JSON.stringify(item.items || []),
            requirementName: item.requirementName,
            responsiblePerson: item.responsiblePerson,
            responsibleTeam: item.responsibleTeam,
            status: 'active',
            updatedBy: userinfo.username,
            workOrderNumber: item.workOrderNumber,
          },
          select: {
            id: true,
            requirementName: true,
            workOrderNumber: true,
          },
        }),
      ),
    );

    return useResponseSuccess({
      items: created,
      success: true,
    });
  } catch (error) {
    logApiError('work-order-requirement-create', error);
    return internalServerErrorResponse(event, '上传工单要求失败');
  }
});
