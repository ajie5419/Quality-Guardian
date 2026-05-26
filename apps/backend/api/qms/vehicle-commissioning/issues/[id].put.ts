import { defineEventHandler, getRouterParam, readBody } from 'h3';
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

  const id = getRouterParam(event, 'id');
  if (!id) {
    return badRequestResponse(event, '无效问题ID');
  }

  try {
    return useResponseSuccess(
      await VehicleCommissioningService.updateIssueFromBody(
        id,
        bodySchema.parse(await readBody(event)),
        String(userinfo.id),
      ),
    );
  } catch (error) {
    logApiError('vehicle-commissioning-issues-update', error, undefined, event);
    return internalServerErrorResponse(event, 'Failed to update issue');
  }
});
