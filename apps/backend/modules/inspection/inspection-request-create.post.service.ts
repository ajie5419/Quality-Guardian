import { defineEventHandler, readBody } from 'h3';
import {
  inspectionRequestCreateBodySchema,
  inspectionRequestCreateV2BodySchema,
  validateInspectionRequestCreateBody,
  validateInspectionRequestCreateV2Body,
} from '~/modules/inspection/inspection-request-create.schema';
import { InspectionRequestCreateService } from '~/modules/inspection/inspection-request-create.service';
import { logApiError } from '~/utils/api-logger';
import { businessErrorResponse, isBusinessError } from '~/utils/business-error';
import { getCurrentUser } from '~/utils/current-user';
import {
  badRequestResponse,
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  const userinfo = getCurrentUser(event);
  const body = inspectionRequestCreateBodySchema.parse(await readBody(event));
  const validation = validateInspectionRequestCreateBody(body);

  if (!validation.isValid) {
    return badRequestResponse(
      event,
      '工单号、工序、一级部件名称、组件名称、班组、报检人、自检记录不能为空',
    );
  }

  try {
    const created = await InspectionRequestCreateService.createRequest(
      event,
      userinfo,
      body,
    );
    return useResponseSuccess(created);
  } catch (error) {
    logApiError('inspection-request-create', error, undefined, event);
    if (isBusinessError(error)) return businessErrorResponse(event, error);
    if (error instanceof Error && error.message.startsWith('BAD_REQUEST:'))
      return badRequestResponse(
        event,
        error.message.replace('BAD_REQUEST:', ''),
      );
    return internalServerErrorResponse(event, '创建报检任务失败');
  }
});

export const inspectionRequestCreateV2Handler = defineEventHandler(
  async (event) => {
    const userinfo = getCurrentUser(event);
    const body = inspectionRequestCreateV2BodySchema.parse(
      await readBody(event),
    );
    if (!validateInspectionRequestCreateV2Body(body).isValid) {
      return badRequestResponse(
        event,
        'workOrderNumber, category, partId, processId, responsible identity, reporter and attachments are required',
      );
    }
    try {
      const created = await InspectionRequestCreateService.createRequest(
        event,
        userinfo,
        body,
        false,
        'V2',
      );
      return useResponseSuccess(created);
    } catch (error) {
      logApiError('inspection-request-create-v2', error, undefined, event);
      if (isBusinessError(error)) return businessErrorResponse(event, error);
      return internalServerErrorResponse(event, 'Failed to create request');
    }
  },
);
