import { defineEventHandler, getRouterParam, setResponseStatus } from 'h3';
import { InspectionService } from '~/services/inspection.service';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import {
  forbiddenResponse,
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

  // Data Ownership Check
  try {
    const existingRecord = await prisma.quality_records.findUnique({
      where: { id },
      select: { inspector: true },
    });

    if (!existingRecord) {
      setResponseStatus(event, 404);
      return useResponseError('记录不存在');
    }

    const userRoles = userinfo.roles || [];
    const isAdmin =
      userRoles.includes('super') ||
      userRoles.includes('admin') ||
      userRoles.includes('Super Admin');
    const isOwner = existingRecord.inspector === userinfo.username;

    if (!isAdmin && !isOwner) {
      return forbiddenResponse(event, '无权删除：您只能删除自己创建的数据');
    }
  } catch (error: any) {
    logApiError('issues', error);
    setResponseStatus(event, 500);
    return useResponseError('权限校验失败');
  }

  try {
    await InspectionService.deleteRecord(id, String(userinfo.id));
    return useResponseSuccess(null);
  } catch (error) {
    logApiError('issues', error);
    setResponseStatus(event, 500);
    return useResponseError('删除问题失败');
  }
});
