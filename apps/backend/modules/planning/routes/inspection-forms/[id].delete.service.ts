import type { H3Event } from 'h3';

import { FileStorageService } from '~/modules/file-storage/file-storage.service';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import { getRequiredRouterParam } from '~/utils/route-param';

export async function inspection_forms_id_delete(event: H3Event) {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) return unAuthorizedResponse(event);

  const id = getRequiredRouterParam(event, 'id', 'ID is required');
  if (typeof id !== 'string') {
    return id;
  }

  try {
    await prisma.inspection_form_templates.update({
      where: { id },
      data: {
        isDeleted: true,
        updatedAt: new Date(),
        updatedBy: userinfo.username,
      },
    });
    await FileStorageService.softDeleteReferences({
      bizId: String(id),
      bizType: 'inspection_form_template',
    });

    return useResponseSuccess({ message: 'Deleted' });
  } catch (error) {
    if (isPrismaSchemaMismatchError(error)) {
      return badRequestResponse(
        event,
        '数据库缺少检验表模块表，请先执行 db push',
      );
    }
    logApiError('inspection-form-delete', error, undefined, event);
    if (isPrismaNotFoundError(error)) {
      return notFoundResponse(event, '检验表不存在');
    }
    return internalServerErrorResponse(event, '删除检验表失败');
  }
}
