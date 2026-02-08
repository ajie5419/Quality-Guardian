import { defineEventHandler, getRouterParam, readBody } from 'h3';
import { SystemLogService } from '~/services/system-log.service';
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
    return useResponseError('缺少ID');
  }

  // Data Ownership Check
  let existingNcNumber: null | string = null;
  try {
    const existingRecord = await prisma.quality_records.findUnique({
      where: { id },
      select: { inspector: true, nonConformanceNumber: true },
    });

    if (!existingRecord) {
      return useResponseError('记录不存在');
    }

    existingNcNumber = existingRecord.nonConformanceNumber;

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
    logApiError('issues', error);
    return useResponseError('权限校验失败');
  }

  try {
    const body = await readBody(event);
    const bodyRecord = body as Record<string, unknown>;

    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    // Only update NC number if it actually changed to avoid unique constraint issues
    if (
      bodyRecord.ncNumber !== undefined &&
      bodyRecord.ncNumber !== existingNcNumber
    ) {
      updateData.nonConformanceNumber = bodyRecord.ncNumber || null;
    }
    if (bodyRecord.workOrderNumber)
      updateData.workOrderNumber = bodyRecord.workOrderNumber;
    if (bodyRecord.projectName) updateData.projectName = bodyRecord.projectName;
    if (bodyRecord.processName) updateData.processName = bodyRecord.processName; // Added processName
    if (bodyRecord.partName) updateData.partName = bodyRecord.partName;
    if (bodyRecord.inspector) updateData.inspector = bodyRecord.inspector;
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
    if (bodyRecord.severity) updateData.severity = bodyRecord.severity;
    if (bodyRecord.reportDate)
      updateData.date = new Date(bodyRecord.reportDate as string);
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

    await SystemLogService.recordAuditLog({
      userId: String(userinfo.id),
      action: 'UPDATE',
      targetType: 'inspection_issue',
      targetId: String(id),
      details: `修改检验问题: ${updateData.partName || '未修改名称'} (${updateData.nonConformanceNumber || existingNcNumber || '无编号'})`,
    });

    return useResponseSuccess(null);
  } catch (error) {
    logApiError('issues', error);
    return useResponseError('更新问题失败');
  }
});
