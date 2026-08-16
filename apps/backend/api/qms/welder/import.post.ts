import { WELDER_PERMISSION_CODES } from '@qgs/shared';
import { defineEventHandler, readBody } from 'h3';
import { z } from 'zod';
import { authorizeWrite } from '~/modules/rbac';
import { WelderService } from '~/modules/welder/welder.service';
import { logApiError } from '~/utils/api-logger';
import { parseNonEmptyArray } from '~/utils/request-validation';
import {
  badRequestResponse,
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

const bodySchema = z.object({
  items: z.array(z.record(z.string(), z.unknown())),
});

export default defineEventHandler(async (event) => {
  await authorizeWrite(event, WELDER_PERMISSION_CODES.IMPORT);
  try {
    const body = bodySchema.parse(await readBody(event));
    const items = parseNonEmptyArray<Record<string, unknown>>(body.items);
    if (!items) {
      return badRequestResponse(event, '未发现可导入的数据');
    }
    return useResponseSuccess(await WelderService.importRows(items));
  } catch (error: unknown) {
    logApiError('welder-import', error, undefined, event);
    return internalServerErrorResponse(event, '焊工导入失败');
  }
});
