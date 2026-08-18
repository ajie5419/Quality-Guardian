import { WELDER_PERMISSION_CODES } from '@qgs/shared';
import { authorizeWrite } from '~/modules/rbac';
import { welderCreateBodySchema } from '~/modules/welder/welder.schema';
import { WelderService } from '~/modules/welder/welder.service';
import { logApiError } from '~/utils/api-logger';
import { defineValidatedHandler } from '~/utils/define-validated-handler';
import {
  badRequestResponse,
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineValidatedHandler(
  welderCreateBodySchema,
  async (event, body) => {
    await authorizeWrite(event, WELDER_PERMISSION_CODES.CREATE);
    try {
      return useResponseSuccess(await WelderService.create(body));
    } catch (error: unknown) {
      logApiError('welder', error, undefined, event);
      if (error instanceof Error && error.message === 'MISSING_REQUIRED')
        return badRequestResponse(event, '缺少必填字段: name/team');
      return internalServerErrorResponse(event, '创建焊工失败');
    }
  },
);
