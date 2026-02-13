import {
  defineEventHandler,
  getRouterParam,
  readBody,
  setResponseStatus,
} from 'h3';
import { SystemLogService } from '~/services/system-log.service';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import { toQualityRecordStatus } from '~/utils/quality-loss-status';
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
  let existingNcNumber: null | string = null;
  try {
    const existingRecord = await prisma.quality_records.findUnique({
      where: { id },
      select: { inspector: true, nonConformanceNumber: true },
    });

    if (!existingRecord) {
      setResponseStatus(event, 404);
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
    setResponseStatus(event, 500);
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
    if (bodyRecord.workOrderNumber !== undefined)
      updateData.workOrderNumber = bodyRecord.workOrderNumber;
    if (bodyRecord.projectName !== undefined)
      updateData.projectName = bodyRecord.projectName;
    if (bodyRecord.processName !== undefined)
      updateData.processName = bodyRecord.processName;
    if (bodyRecord.partName !== undefined)
      updateData.partName = bodyRecord.partName;
    if (bodyRecord.inspector !== undefined)
      updateData.inspector = bodyRecord.inspector;
    if (bodyRecord.description !== undefined)
      updateData.description = bodyRecord.description;
    if (bodyRecord.quantity !== undefined)
      updateData.quantity = Number(bodyRecord.quantity);
    if (bodyRecord.lossAmount !== undefined)
      updateData.lossAmount = Number(bodyRecord.lossAmount);
    if (bodyRecord.responsibleDepartment)
      updateData.responsibleDepartment = bodyRecord.responsibleDepartment;
    if (bodyRecord.supplierName !== undefined)
      updateData.supplierName = bodyRecord.supplierName;
    if (bodyRecord.rootCause !== undefined)
      updateData.rootCause = bodyRecord.rootCause;
    if (bodyRecord.solution !== undefined)
      updateData.solution = bodyRecord.solution;
    if (bodyRecord.defectType !== undefined)
      updateData.defectType = bodyRecord.defectType;
    if (bodyRecord.defectSubtype)
      updateData.defectSubtype = bodyRecord.defectSubtype;
    if (bodyRecord.severity !== undefined)
      updateData.severity = bodyRecord.severity;
    if (bodyRecord.reportDate)
      updateData.date = new Date(bodyRecord.reportDate as string);
    if (bodyRecord.photos !== undefined) {
      updateData.issuePhoto = JSON.stringify(bodyRecord.photos);
    }
    if (bodyRecord.claim !== undefined) {
      updateData.isClaim =
        bodyRecord.claim === 'Yes' || bodyRecord.claim === true;
    }

    if (bodyRecord.status !== undefined) {
      updateData.status = toQualityRecordStatus(bodyRecord.status as string);
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
  } catch (error: unknown) {
    logApiError('issues', error);
    const errorCode = (error as { code?: string }).code;
    setResponseStatus(event, errorCode === 'P2025' ? 404 : 500);
    return useResponseError('更新问题失败');
  }
});
