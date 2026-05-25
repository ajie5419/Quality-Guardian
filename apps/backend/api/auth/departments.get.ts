import { defineEventHandler, setResponseStatus } from 'h3';
import { DeptService } from '~/modules/dept/dept.service';
import { logApiError } from '~/utils/api-logger';
import { useResponseError, useResponseSuccess } from '~/utils/response';

/**
 * Public endpoint to fetch departments for registration
 */
export default defineEventHandler(async (event) => {
  try {
    return useResponseSuccess(await DeptService.findActiveTree());
  } catch (error) {
    logApiError('departments', error, undefined, event);
    setResponseStatus(event, 500);
    return useResponseError('Failed to fetch departments');
  }
});
