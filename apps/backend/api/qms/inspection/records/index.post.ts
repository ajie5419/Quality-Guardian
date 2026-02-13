import { defineEventHandler, readBody, setResponseStatus } from 'h3';
import { InspectionService } from '~/services/inspection.service';
import { logApiError } from '~/utils/api-logger';
import { useResponseError, useResponseSuccess } from '~/utils/response';

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event);
    const result = await InspectionService.create(body);
    return useResponseSuccess(result);
  } catch (error: unknown) {
    logApiError('inspection-create', error);
    setResponseStatus(event, 500);
    return useResponseError('Failed to create inspection record');
  }
});
