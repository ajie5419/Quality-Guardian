import { defineEventHandler, getRouterParam, readBody } from 'h3';
import {
  buildGovernedCanonicalWritePairForTable,
  buildGovernedWriteFieldsForTable,
} from '~/core/master-data/governance-write';
import { logApiError } from '~/utils/api-logger';
import { recordBusinessAuditLog } from '~/utils/audit-log';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import {
  badRequestResponse,
  internalServerErrorResponse,
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) return unAuthorizedResponse(event);

  const id = String(getRouterParam(event, 'id') || '').trim();
  if (!id) {
    return badRequestResponse(event, '无效要求ID');
  }

  try {
    const body = (await readBody(event)) as {
      confirm?: boolean;
      requirementName?: string;
      responsiblePerson?: string;
      responsibleTeam?: string;
    };
    const confirm = Boolean(body.confirm);
    const governedFields = buildGovernedWriteFieldsForTable(
      'work_order_requirements',
      {
        requirementName:
          body.requirementName === undefined
            ? undefined
            : String(body.requirementName || '').trim() || null,
        responsibleTeam:
          body.responsibleTeam === undefined
            ? undefined
            : String(body.responsibleTeam || '').trim() || null,
      },
    );
    const governedCanonicalIds = await buildGovernedCanonicalWritePairForTable(
      'work_order_requirements',
      governedFields as Record<string, unknown>,
    );

    const updated = await prisma.work_order_requirements.update({
      where: { id },
      data: {
        confirmedAt: confirm ? new Date() : null,
        confirmer: confirm ? userinfo.username : null,
        confirmStatus: confirm ? 'CONFIRMED' : 'PENDING',
        requirementName:
          body.requirementName === undefined
            ? undefined
            : String(body.requirementName || '').trim(),
        responsiblePerson:
          body.responsiblePerson === undefined
            ? undefined
            : String(body.responsiblePerson || '').trim() || null,
        ...governedFields,
        ...governedCanonicalIds,
        updatedBy: userinfo.username,
      },
      select: {
        confirmedAt: true,
        confirmer: true,
        confirmStatus: true,
        id: true,
        requirementName: true,
        workOrderNumber: true,
      },
    });

    await recordBusinessAuditLog(event, {
      userId: userinfo.id,
      action: 'UPDATE',
      targetType: 'work_order_requirement',
      targetId: String(updated.id),
      detailsTemplate:
        '更新工单要求: {{workOrderNumber}} - {{requirementName}}',
      detailsVariables: {
        requirementName: updated.requirementName,
        workOrderNumber: updated.workOrderNumber,
      },
    });

    return useResponseSuccess(updated);
  } catch (error) {
    logApiError('work-order-requirement-update', error, undefined, event);
    return internalServerErrorResponse(event, '更新工单要求失败');
  }
});
