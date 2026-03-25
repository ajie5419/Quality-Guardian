import { defineEventHandler, readBody } from 'h3';
import { InspectionService } from '~/services/inspection.service';
import { logApiError } from '~/utils/api-logger';
import {
  badRequestResponse,
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
    if (
      error instanceof Error &&
      String(error.message || '').startsWith('VALIDATION:')
    ) {
      return badRequestResponse(
        event,
        String(error.message || '').replace('VALIDATION:', ''),
      );
    }
    return internalServerErrorResponse(
      event,
      'Failed to create inspection record',
    );
  }
});
