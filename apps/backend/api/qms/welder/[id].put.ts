import { welderUpdateBodySchema } from '~/modules/welder/welder.schema';
import { WelderService } from '~/modules/welder/welder.service';
import { logApiError } from '~/utils/api-logger';
import { defineValidatedHandler } from '~/utils/define-validated-handler';
import {
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';
import { getRequiredRouterParam } from '~/utils/route-param';

export default defineValidatedHandler(
  welderUpdateBodySchema,
  async (event, body) => {
    const id = getRequiredRouterParam(event, 'id', '缺少焊工ID');
    if (typeof id !== 'string') {
      return id;
    }

    try {
      await WelderService.update(id, body);
      return useResponseSuccess(null);
    } catch (error: unknown) {
      logApiError('welder', error, undefined, event);
      return internalServerErrorResponse(event, '更新焊工失败');
    }
  },
);
