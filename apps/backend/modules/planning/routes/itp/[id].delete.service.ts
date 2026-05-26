import type { H3Event } from 'h3';

import { recordBusinessAuditLog } from '~/modules/system-log/audit-log';
import { logApiError } from '~/utils/api-logger';
import { awaitMockDelay } from '~/utils/index';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import { isPrismaNotFoundError } from '~/utils/prisma-error';
import { getRequiredRouterParam } from '~/utils/route-param';

export async function itp_id_delete(event: H3Event) {
  await awaitMockDelay();
  const userinfo = verifyAccessToken(event);
  const id = getRequiredRouterParam(event, 'id', 'ID required');
  if (typeof id !== 'string') {
    return id;
  }

  try {
    // 软删除
    const deleted = await prisma.itp_items.update({
      where: { id },
      data: { isDeleted: true },
    });

    await recordBusinessAuditLog(event, {
      userId: userinfo?.id,
      action: 'DELETE',
      targetType: 'planning_itp_item',
      targetId: String(id),
      detailsTemplate: '删除 ITP 条目: {{item}}',
      detailsVariables: {
        item: deleted.processStep || deleted.activity || id,
      },
    });

    return useResponseSuccess(null);
  } catch (error) {
    logApiError('itp', error, undefined, event);
    if (isPrismaNotFoundError(error)) {
      return notFoundResponse(event, 'ITP 条目不存在');
    }
    return internalServerErrorResponse(event, '删除 ITP 条目失败');
  }
}
