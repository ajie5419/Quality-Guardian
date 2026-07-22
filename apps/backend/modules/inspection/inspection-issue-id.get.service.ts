import { INSPECTION_ISSUE_PERMISSION_CODES } from '@qgs/shared';
import { defineEventHandler } from 'h3';
import { InspectionIssueAccessService } from '~/modules/inspection/inspection-issue-access.service';
import { InspectionIssueListService } from '~/modules/inspection/inspection-issue-list.service';
import { logApiError } from '~/utils/api-logger';
import {
  BusinessError,
  businessErrorResponse,
  legacyErrorToBusinessError,
} from '~/utils/business-error';
import { getCurrentUser } from '~/utils/current-user';
import {
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';
import { getRequiredRouterParam } from '~/utils/route-param';

export default defineEventHandler(async (event) => {
  const userinfo = getCurrentUser(event);
  const id = getRequiredRouterParam(event, 'id', '缺少ID');
  if (typeof id !== 'string') return id;

  try {
    const userContext = await InspectionIssueAccessService.getAccessContext(
      userinfo,
      INSPECTION_ISSUE_PERMISSION_CODES.VIEW,
    );
    const issue = await InspectionIssueListService.getIssueById({
      id,
      userContext: { ...userContext, username: userinfo.username },
    });
    if (!issue) {
      throw new BusinessError('NOT_FOUND', '不合格品项不存在', 404);
    }
    return useResponseSuccess(issue);
  } catch (error) {
    logApiError('inspection-issue-detail', error, undefined, event);
    const businessError = legacyErrorToBusinessError(error);
    if (businessError) return businessErrorResponse(event, businessError);
    return internalServerErrorResponse(event, '获取不合格品项详情失败');
  }
});
