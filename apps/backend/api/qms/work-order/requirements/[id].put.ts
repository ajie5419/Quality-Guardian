import { defineEventHandler, getRouterParam, readBody } from 'h3';
import { logApiError } from '~/utils/api-logger';
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
      responsiblePerson?: string;
      responsibleTeam?: string;
    };
    const confirm = Boolean(body.confirm);

    const updated = await prisma.work_order_requirements.update({
      where: { id },
      data: {
        confirmedAt: confirm ? new Date() : null,
        confirmer: confirm ? userinfo.username : null,
        confirmStatus: confirm ? 'CONFIRMED' : 'PENDING',
        responsiblePerson:
          body.responsiblePerson === undefined
            ? undefined
            : String(body.responsiblePerson || '').trim() || null,
        responsibleTeam:
          body.responsibleTeam === undefined
            ? undefined
            : String(body.responsibleTeam || '').trim() || null,
        updatedBy: userinfo.username,
      },
      select: {
        confirmedAt: true,
        confirmer: true,
        confirmStatus: true,
        id: true,
      },
    });

    return useResponseSuccess(updated);
  } catch (error) {
    logApiError('work-order-requirement-update', error);
    return internalServerErrorResponse(event, '更新工单要求失败');
  }
});
