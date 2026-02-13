import { defineEventHandler, readBody } from 'h3';
import { InspectionService } from '~/services/inspection.service';
import { logApiError } from '~/utils/api-logger';
import {
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event);
    const result = await InspectionService.create(body);
    return useResponseSuccess(result);
  } catch (error: unknown) {
    logApiError('inspection-create', error);
    return internalServerErrorResponse(
      event,
      'Failed to create inspection record',
    );
  }
});
