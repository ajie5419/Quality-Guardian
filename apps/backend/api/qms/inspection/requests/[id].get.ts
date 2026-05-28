import { defineEventHandler } from 'h3';
import { InspectionRequestQueryService } from '~/modules/inspection/inspection-request-query.service';
import { logApiError } from '~/utils/api-logger';
import {
  internalServerErrorResponse,
  notFoundResponse,
  useResponseSuccess,
} from '~/utils/response';
import { getRequiredRouterParam } from '~/utils/route-param';

export default defineEventHandler(async (event) => {
  const id = getRequiredRouterParam(event, 'id', 'ID required');
  if (typeof id !== 'string') return id;

  try {
    const request = await InspectionRequestQueryService.getRequestDetail(id);
    if (!request) return notFoundResponse(event, '报检任务不存在');
    return useResponseSuccess(request);
  } catch (error) {
    logApiError('inspection-request-detail', error, undefined, event);
    return internalServerErrorResponse(event, '获取报检任务详情失败');
  }
});
