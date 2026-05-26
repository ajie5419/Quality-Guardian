import { defineEventHandler, readBody } from 'h3';
import { z } from 'zod';
import { VehicleCommissioningService } from '~/modules/vehicle-commissioning/vehicle-commissioning.service';
import { logApiError } from '~/utils/api-logger';
import { getCurrentUser } from '~/utils/current-user';
import {
  badRequestResponse,
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

const bodySchema = z.record(z.string(), z.unknown());

export default defineEventHandler(async (event) => {
  const userinfo = getCurrentUser(event);

  try {
    const body = bodySchema.parse(await readBody(event));
    if (!body.description && !body.title) {
      return badRequestResponse(event, '缺少问题描述');
    }
    return useResponseSuccess(
      await VehicleCommissioningService.createIssueFromBody(
        body,
        String(userinfo.id),
      ),
    );
  } catch (error) {
    logApiError('vehicle-commissioning-issues-create', error, undefined, event);
    return internalServerErrorResponse(event, 'Failed to create issue');
  }
});
