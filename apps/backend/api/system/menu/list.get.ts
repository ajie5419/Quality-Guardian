import { defineEventHandler, setResponseStatus } from 'h3';
import { RbacService } from '~/modules/rbac/rbac.service';
import { logApiError } from '~/utils/api-logger';
import { useResponseError, useResponseSuccess } from '~/utils/response';

export default defineEventHandler(async (event) => {
  try {
    return useResponseSuccess(await RbacService.getAllMenuTree());
  } catch (error) {
    logApiError('list', error, undefined, event);
    setResponseStatus(event, 500);
    return useResponseError('Failed to fetch menu list');
  }
});
