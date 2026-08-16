import { PERMISSION_CODES } from '@qgs/shared';
import { defineEventHandler } from 'h3';
import { authorizeWrite } from '~/modules/rbac';
import { WorkOrderRouteService } from '~/modules/work-order/work-order-route.service';
import { logApiError } from '~/utils/api-logger';
import {
  businessErrorResponse,
  legacyErrorToBusinessError,
} from '~/utils/business-error';
import { getCurrentUser } from '~/utils/current-user';
import { getRequiredQueryParam } from '~/utils/query-param';
import {
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  await authorizeWrite(event, PERMISSION_CODES.QMS.WORK_ORDER.DELETE);
  const userinfo = getCurrentUser(event);

  const id = getRequiredQueryParam(event, 'id', '缺少工单号');
  if (typeof id !== 'string') {
    return id;
  }

  try {
    await WorkOrderRouteService.deleteById(event, id, userinfo);
    return useResponseSuccess(null);
  } catch (error) {
    logApiError('work-order', error, undefined, event);
    const businessError = legacyErrorToBusinessError(error);
    if (businessError) {
      return businessErrorResponse(event, businessError);
    }
    return internalServerErrorResponse(event, '删除工单失败');
  }
});
