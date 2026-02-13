import {
  defineEventHandler,
  getRouterParam,
  readBody,
  setResponseStatus,
} from 'h3';
import { SystemLogService } from '~/services/system-log.service';
import { logApiError } from '~/utils/api-logger';
import {
  buildInspectionIssueUpdateData,
  hasInspectionIssueAdminAccess,
} from '~/utils/inspection-issue';
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

    const isAdmin = hasInspectionIssueAdminAccess(userinfo.roles);
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
    const updateData = buildInspectionIssueUpdateData(
      bodyRecord,
      existingNcNumber,
    );

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
