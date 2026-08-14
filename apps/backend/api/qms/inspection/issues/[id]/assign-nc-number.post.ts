import { defineEventHandler } from 'h3';
import { InspectionApiService } from '~/modules/inspection/inspection-api.service';
import { logApiError } from '~/utils/api-logger';
import {
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
  const id = getRequiredRouterParam(event, 'id', '缺少ID');
  if (typeof id !== 'string') return id;
  try {
    const record = await InspectionApiService.assignIssueNcNumber(
      getCurrentUser(event),
      id,
    );
    return useResponseSuccess(record);
  } catch (error) {
    logApiError('issue-assign-nc-number', error, undefined, event);
    const businessError = legacyErrorToBusinessError(error);
    if (businessError) return businessErrorResponse(event, businessError);
    return internalServerErrorResponse(event, '生成不合格编号失败');
  }
});
