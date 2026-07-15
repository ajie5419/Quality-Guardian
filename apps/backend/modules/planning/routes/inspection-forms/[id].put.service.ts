import type { H3Event } from 'h3';

import { readBody } from 'h3';
import { z } from 'zod';
import { InspectionRouteService } from '~/modules/inspection/inspection-route.service';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import {
  badRequestResponse,
  conflictResponse,
  internalServerErrorResponse,
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';
import { getRequiredRouterParam } from '~/utils/route-param';

const inspectionFormUpdateBodySchema = z.record(z.string(), z.unknown());

export async function inspection_forms_id_put(event: H3Event) {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) return unAuthorizedResponse(event);

  const id = getRequiredRouterParam(event, 'id', 'ID is required');
  if (typeof id !== 'string') {
    return id;
  }

  try {
    const body = inspectionFormUpdateBodySchema.parse(await readBody(event));
    const updated = await InspectionRouteService.updateInspectionFormTemplate(
      id,
      body,
      userinfo,
    );
    return useResponseSuccess(updated);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('SCHEMA_MISMATCH:'))
      return badRequestResponse(
        event,
        error.message.replace('SCHEMA_MISMATCH:', ''),
      );
    if (error instanceof Error && error.message.startsWith('NOT_FOUND:'))
      return badRequestResponse(event, error.message.replace('NOT_FOUND:', ''));
    if (error instanceof Error && error.message.startsWith('CONFLICT:'))
      return conflictResponse(event, error.message.replace('CONFLICT:', ''));
    logApiError('inspection-form-update', error, undefined, event);
    return internalServerErrorResponse(event, '更新检验表失败');
  }
}
