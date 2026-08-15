import { defineEventHandler } from 'h3';
import { InspectionRequestDispatchService } from '~/modules/inspection/inspection-request-dispatch.service';
import { UserService } from '~/modules/user';
import { logApiError } from '~/utils/api-logger';
import { BusinessError } from '~/utils/business-error';
import { getCurrentUser } from '~/utils/current-user';
import {
  forbiddenResponse,
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

/**
 * Minimal active-QC inspector options for the dispatch flow. Access is gated
 * on the dispatch permission so ordinary logged-in users cannot enumerate the
 * full user list through the generic user endpoint.
 */
export default defineEventHandler(async (event) => {
  const userinfo = getCurrentUser(event);
  try {
    await InspectionRequestDispatchService.ensureDispatchPermission(userinfo);
    const inspectors = await UserService.findInspectors();
    return useResponseSuccess(
      inspectors.map((inspector) => ({
        id: inspector.id,
        realName: inspector.realName,
        username: inspector.username,
      })),
    );
  } catch (error) {
    logApiError('inspection-inspectors', error, undefined, event);
    if (error instanceof BusinessError && error.httpStatus === 403) {
      return forbiddenResponse(event, error.message);
    }
    return internalServerErrorResponse(event, '获取检验员列表失败');
  }
});
