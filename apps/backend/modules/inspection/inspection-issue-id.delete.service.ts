import { INSPECTION_ISSUE_PERMISSION_CODES } from '@qgs/shared';
import { defineEventHandler } from 'h3';
import {
  findInspectionIssueAccessRecord,
  hasInspectionIssueWriteAccess,
} from '~/modules/inspection/inspection-issue';
import { InspectionIssueAccessService } from '~/modules/inspection/inspection-issue-access.service';
import { InspectionService } from '~/modules/inspection/inspection.service';
import { logApiError } from '~/utils/api-logger';
import {
  businessErrorResponse,
  legacyErrorToBusinessError,
} from '~/utils/business-error';
import { getCurrentUser } from '~/utils/current-user';
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
  if (typeof id !== 'string') {
    return id;
  }

  // Data Ownership Check
  try {
    await InspectionIssueAccessService.ensurePermission(
      userinfo,
      INSPECTION_ISSUE_PERMISSION_CODES.DELETE,
    );
    const existingRecord = await findInspectionIssueAccessRecord(id);

    if (!existingRecord) {
      return notFoundResponse(event, '记录不存在');
    }

    if (
      !hasInspectionIssueWriteAccess({
        createdBy: existingRecord.createdBy,
        userId: userinfo.id || userinfo.userId,
      })
    ) {
      return forbiddenResponse(event, '无权删除：您只能删除自己创建的数据');
    }
  } catch (error: unknown) {
    logApiError('issues', error, undefined, event);
    const businessError = legacyErrorToBusinessError(error);
    if (businessError) return businessErrorResponse(event, businessError);
    return internalServerErrorResponse(event, '权限校验失败');
  }

  try {
    await InspectionService.deleteRecord(id, String(userinfo.id));
    return useResponseSuccess(null);
  } catch (error) {
    logApiError('issues', error, undefined, event);
    const businessError = legacyErrorToBusinessError(error);
    if (businessError) return businessErrorResponse(event, businessError);
    return internalServerErrorResponse(event, '删除问题失败');
  }
});
