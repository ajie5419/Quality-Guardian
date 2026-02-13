import { defineEventHandler, getQuery, setResponseStatus } from 'h3';
import { InspectionService } from '~/services/inspection.service';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import {
  unAuthorizedResponse,
  useResponseError,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  const query = getQuery(event);
  const year = query.year ? Number.parseInt(String(query.year)) : undefined;

  try {
    const result = await InspectionService.getIssueStats(year);
    return useResponseSuccess(result);
  } catch (error) {
    logApiError('inspection-issue-stats', error);
    setResponseStatus(event, 500);
    return useResponseError('Failed to fetch inspection issue stats');
  }
});
