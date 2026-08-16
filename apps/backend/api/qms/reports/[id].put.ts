import { REPORTS_PERMISSION_CODES } from '@qgs/shared';
import { defineEventHandler, readBody } from 'h3';
import { z } from 'zod';
import { authorizeWrite } from '~/modules/rbac';
import { ReportRouteService } from '~/modules/report/report-route.service';
import { logApiError } from '~/utils/api-logger';
import {
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';
import { getRequiredRouterParam } from '~/utils/route-param';

const bodySchema = z.record(z.string(), z.unknown());

export default defineEventHandler(async (event) => {
  await authorizeWrite(event, REPORTS_PERMISSION_CODES.EDIT);
  const id = getRequiredRouterParam(event, 'id', 'id required');
  if (typeof id !== 'string') {
    return id;
  }

  try {
    return useResponseSuccess(
      await ReportRouteService.updateById(
        id,
        bodySchema.parse(await readBody(event)),
      ),
    );
  } catch (error: unknown) {
    logApiError('reports', error, undefined, event);
    return internalServerErrorResponse(event, 'Update failed');
  }
});
