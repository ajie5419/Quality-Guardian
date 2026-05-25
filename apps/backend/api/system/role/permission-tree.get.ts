import { defineEventHandler, setResponseStatus } from 'h3';
import { RbacService } from '~/modules/rbac/rbac.service';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import {
  unAuthorizedResponse,
  useResponseError,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  const userinfo = await verifyAccessToken(event);
  if (!userinfo) return unAuthorizedResponse(event);

  try {
    return useResponseSuccess(await RbacService.getRolePermissionTree());
  } catch (error: unknown) {
    logApiError('permission-tree', error, undefined, event);
    setResponseStatus(event, 500);
    return useResponseError('Failed to fetch permission tree');
  }
});
