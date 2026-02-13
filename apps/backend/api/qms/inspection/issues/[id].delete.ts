import { defineEventHandler } from 'h3';
import { InspectionService } from '~/services/inspection.service';
import { logApiError } from '~/utils/api-logger';
import { hasInspectionIssueAdminAccess } from '~/utils/inspection-issue';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import {
  forbiddenResponse,
  internalServerErrorResponse,
  notFoundResponse,
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';
import { getRequiredRouterParam } from '~/utils/route-param';

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  const id = getRequiredRouterParam(event, 'id', '缺少ID');
  if (typeof id !== 'string') {
    return id;
  }

  // Data Ownership Check
  try {
    const existingRecord = await prisma.quality_records.findUnique({
      where: { id },
      select: { inspector: true },
    });

    if (!existingRecord) {
      return notFoundResponse(event, '记录不存在');
    }

    const isAdmin = hasInspectionIssueAdminAccess(userinfo.roles);
    const isOwner = existingRecord.inspector === userinfo.username;

    if (!isAdmin && !isOwner) {
      return forbiddenResponse(event, '无权删除：您只能删除自己创建的数据');
    }
  } catch (error: unknown) {
    logApiError('issues', error);
    return internalServerErrorResponse(event, '权限校验失败');
  }

  try {
    await InspectionService.deleteRecord(id, String(userinfo.id));
    return useResponseSuccess(null);
  } catch (error) {
    logApiError('issues', error);
    return internalServerErrorResponse(event, '删除问题失败');
  }
});
