import { defineEventHandler, getRouterParam } from 'h3';
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
    return useResponseError('缺少ID');
  }

  // Data Ownership Check
  try {
    const existingRecord = await prisma.quality_records.findUnique({
      where: { id },
      select: { inspector: true },
    });

    if (!existingRecord) {
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
  } catch (error) {
    console.error('Ownership check failed:', error);
    return useResponseError('权限校验失败');
  }

  try {
    await prisma.quality_records.update({
      where: { id },
      data: {
        isDeleted: true,
        updatedAt: new Date(),
      },
    });

    return useResponseSuccess(null);
  } catch (error) {
    console.error('Failed to delete inspection issue:', error);
    return useResponseError('删除问题失败');
  }
});
