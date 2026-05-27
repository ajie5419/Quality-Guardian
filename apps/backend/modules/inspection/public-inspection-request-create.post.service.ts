import { defineEventHandler, readBody } from 'h3';
import { InspectionApiService } from '~/modules/inspection/inspection-api.service';
import {
  inspectionRequestCreateBodySchema,
  validateInspectionRequestCreateBody,
} from '~/modules/inspection/inspection-request-create.schema';
import { logApiError } from '~/utils/api-logger';
import {
  badRequestResponse,
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  const body = inspectionRequestCreateBodySchema.parse(await readBody(event));
  const validation = validateInspectionRequestCreateBody(body);

  if (!validation.isValid) {
    return badRequestResponse(
      event,
      '工单号、工序、一级部件名称、组件名称、班组、报检人、自检记录不能为空',
    );
  }

  try {
    return useResponseSuccess(
      await InspectionApiService.createRequest(event, null, body, true),
    );
  } catch (error) {
    logApiError('public-inspection-request-create', error, undefined, event);
    if (error instanceof Error && error.message.startsWith('BAD_REQUEST:'))
      return badRequestResponse(
        event,
        error.message.replace('BAD_REQUEST:', ''),
      );
    return internalServerErrorResponse(event, '创建报检任务失败');
  }
});
