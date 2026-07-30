import { defineEventHandler, readBody } from 'h3';
import {
  inspectionRequestCreateV2BodySchema,
  validateInspectionRequestCreateV2Body,
} from '~/modules/inspection/inspection-request-create.schema';
import { InspectionRequestCreateService } from '~/modules/inspection/inspection-request-create.service';
import { logApiError } from '~/utils/api-logger';
import {
  BusinessError,
  businessErrorResponse,
  isBusinessError,
} from '~/utils/business-error';
import { getCurrentUser } from '~/utils/current-user';
import {
  badRequestResponse,
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  return businessErrorResponse(
    event,
    new BusinessError(
      'INSPECTION_REQUEST_V2_REQUIRED',
      'Use POST /api/qms/inspection/requests/v2 with category, partId and processId',
      410,
    ),
  );
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
        'workOrderNumber, category, material identity, processId, responsible identity, reporter and attachments are required',
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
