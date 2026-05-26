import { defineEventHandler, setResponseStatus } from 'h3';
import { DeptService } from '~/modules/dept';
import { logApiError } from '~/utils/api-logger';
import { useResponseError, useResponseSuccess } from '~/utils/response';

export default defineEventHandler(async (event) => {
  try {
    const tree = await DeptService.findAll();
    return useResponseSuccess(tree);
  } catch (error) {
    logApiError('dept', error, undefined, event);
    setResponseStatus(event, 500);
    return useResponseError('Failed to fetch departments');
  }
});
