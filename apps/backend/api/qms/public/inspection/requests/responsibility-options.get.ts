import { defineEventHandler, getQuery } from 'h3';
import {
  inspectionRequestResponsibilityOptionsQuerySchema,
  InspectionRequestResponsibilityOptionsService,
} from '~/modules/inspection';
import { logApiError } from '~/utils/api-logger';
import {
  badRequestResponse,
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  const query = inspectionRequestResponsibilityOptionsQuerySchema.parse(
    getQuery(event),
  );
  if (!query.responsibilityType) {
    return badRequestResponse(event, '责任类型不能为空');
  }
  try {
    return useResponseSuccess(
      await InspectionRequestResponsibilityOptionsService.list({
        ...query,
        responsibilityType: query.responsibilityType,
      }),
    );
  } catch (error) {
    logApiError(
      'public-inspection-request-responsibility-options',
      error,
      undefined,
      event,
    );
    return internalServerErrorResponse(event, '获取责任归属选项失败');
  }
});
