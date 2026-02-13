import { defineEventHandler, readBody } from 'h3';
import { SystemLogService } from '~/services/system-log.service';
import { logApiError } from '~/utils/api-logger';
import {
  buildInspectionIssueUpdateData,
  findInspectionIssueAccessRecord,
  hasInspectionIssueWriteAccess,
} from '~/utils/inspection-issue';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import { isPrismaNotFoundError } from '~/utils/prisma-error';
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
  let existingNcNumber: null | string = null;
  try {
    const existingRecord = await findInspectionIssueAccessRecord(id);

    if (!existingRecord) {
      return notFoundResponse(event, '记录不存在');
    }

    existingNcNumber = existingRecord.nonConformanceNumber;

    if (
      !hasInspectionIssueWriteAccess({
        inspector: existingRecord.inspector,
        roles: userinfo.roles,
        username: userinfo.username,
      })
    ) {
      return forbiddenResponse(event, '无权修改：您只能修改自己创建的数据');
    }
  } catch (error) {
    logApiError('issues', error);
    return internalServerErrorResponse(event, '权限校验失败');
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
    if (isPrismaNotFoundError(error)) {
      return notFoundResponse(event, '记录不存在');
    }
    return internalServerErrorResponse(event, '更新问题失败');
  }
});
