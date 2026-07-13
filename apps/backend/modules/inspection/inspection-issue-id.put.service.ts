import { INSPECTION_ISSUE_PERMISSION_CODES } from '@qgs/shared';
import { defineEventHandler, readBody } from 'h3';
import { InspectionApiService } from '~/modules/inspection/inspection-api.service';
import {
  findInspectionIssueAccessRecord,
  hasInspectionIssueWriteAccess,
} from '~/modules/inspection/inspection-issue';
import { InspectionIssueAccessService } from '~/modules/inspection/inspection-issue-access.service';
import { parseInspectionIssueUpdateBody } from '~/modules/inspection/inspection-issue.schema';
import { logApiError } from '~/utils/api-logger';
import {
  businessErrorResponse,
  legacyErrorToBusinessError,
} from '~/utils/business-error';
import { getCurrentUser } from '~/utils/current-user';
import { isPrismaNotFoundError } from '~/utils/prisma-error';
import {
  forbiddenResponse,
  internalServerErrorResponse,
  notFoundResponse,
  useResponseSuccess,
} from '~/utils/response';
import { getRequiredRouterParam } from '~/utils/route-param';

export default defineEventHandler(async (event) => {
  const userinfo = getCurrentUser(event);

  const id = getRequiredRouterParam(event, 'id', '缺少ID');
  if (typeof id !== 'string') return id;
  let existingNcNumber: null | string = null;
  try {
    await InspectionIssueAccessService.ensurePermission(
      userinfo,
      INSPECTION_ISSUE_PERMISSION_CODES.EDIT,
    );
    const existingRecord = await findInspectionIssueAccessRecord(id);
    if (!existingRecord) return notFoundResponse(event, '记录不存在');
    existingNcNumber = existingRecord.nonConformanceNumber;
    if (
      !hasInspectionIssueWriteAccess({
        createdBy: existingRecord.createdBy,
        userId: userinfo.id || userinfo.userId,
      })
    )
      return forbiddenResponse(event, '无权修改：您只能修改自己创建的数据');
  } catch (error) {
    logApiError('issues', error, undefined, event);
    const businessError = legacyErrorToBusinessError(error);
    if (businessError) return businessErrorResponse(event, businessError);
    return internalServerErrorResponse(event, '权限校验失败');
  }

  try {
    const body = parseInspectionIssueUpdateBody(await readBody(event));
    await InspectionApiService.updateIssue(
      userinfo,
      id,
      body,
      existingNcNumber,
    );
    return useResponseSuccess(null);
  } catch (error: unknown) {
    logApiError('issues', error, undefined, event);
    const businessError = legacyErrorToBusinessError(error);
    if (businessError) return businessErrorResponse(event, businessError);
    if (isPrismaNotFoundError(error))
      return notFoundResponse(event, '记录不存在');
    return internalServerErrorResponse(event, '更新问题失败');
  }
});
