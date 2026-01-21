import { defineEventHandler, getRouterParam, readBody } from 'h3';
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
      return forbiddenResponse(event, '无权修改：您只能修改自己创建的数据');
    }
  } catch (error) {
    console.error('Ownership check failed:', error);
    return useResponseError('权限校验失败');
  }

  try {
    const body = await readBody(event);
    const bodyRecord = body as Record<string, unknown>;

    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (bodyRecord.ncNumber !== undefined)
      updateData.nonConformanceNumber = bodyRecord.ncNumber || null;
    if (bodyRecord.projectName) updateData.projectName = bodyRecord.projectName; // Added projectName
    if (bodyRecord.partName) updateData.partName = bodyRecord.partName;
    if (bodyRecord.description) updateData.description = bodyRecord.description;
    if (bodyRecord.quantity) updateData.quantity = Number(bodyRecord.quantity);
    if (bodyRecord.lossAmount)
      updateData.lossAmount = Number(bodyRecord.lossAmount);
    if (bodyRecord.responsibleDepartment)
      updateData.responsibleDepartment = bodyRecord.responsibleDepartment;
    if (bodyRecord.supplierName !== undefined)
      updateData.supplierName = bodyRecord.supplierName;
    if (bodyRecord.rootCause) updateData.rootCause = bodyRecord.rootCause;
    if (bodyRecord.solution) updateData.solution = bodyRecord.solution;
    if (bodyRecord.defectType) updateData.defectType = bodyRecord.defectType;
    if (bodyRecord.defectSubtype)
      updateData.defectSubtype = bodyRecord.defectSubtype;
    // Fix for Photos Update
    if (bodyRecord.photos) {
      updateData.issuePhoto = JSON.stringify(bodyRecord.photos);
    }
    // Fix for Claim Update
    if (bodyRecord.claim !== undefined) {
      updateData.isClaim =
        bodyRecord.claim === 'Yes' || bodyRecord.claim === true;
    }

    if (bodyRecord.status) {
      const statusBody = String(bodyRecord.status).toUpperCase();
      switch (statusBody) {
        case 'CLOSED':
        case '已关闭': {
          updateData.status = 'CLOSED';
          break;
        }
        case 'IN_PROGRESS':
        case '进行中': {
          updateData.status = 'IN_PROGRESS';
          break;
        }
        case 'OPEN':
        case '开启': {
          updateData.status = 'OPEN';
          break;
        }
        default: {
          updateData.status = bodyRecord.status;
        }
      }
    }

    await prisma.quality_records.update({
      where: { id },
      data: updateData,
    });

    return useResponseSuccess(null);
  } catch (error) {
    console.error('Failed to update inspection issue:', error);
    return useResponseError('更新问题失败');
  }
});
