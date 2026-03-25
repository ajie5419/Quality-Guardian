import { defineEventHandler, readBody } from 'h3';
import { InspectionService } from '~/services/inspection.service';
import { logApiError } from '~/utils/api-logger';
import { isPrismaNotFoundError } from '~/utils/prisma-error';
import {
  badRequestResponse,
  internalServerErrorResponse,
  notFoundResponse,
  useResponseSuccess,
} from '~/utils/response';
import { getRequiredRouterParam } from '~/utils/route-param';

export default defineEventHandler(async (event) => {
  const id = getRequiredRouterParam(event, 'id', 'ID required');
  if (typeof id !== 'string') {
    return id;
  }

  try {
    const body = await readBody(event);
    const result = await InspectionService.update(id, body);
    return useResponseSuccess(result);
  } catch (error: unknown) {
    logApiError('inspection-update', error);
    if (
      error instanceof Error &&
      String(error.message || '').startsWith('VALIDATION:')
    ) {
      return badRequestResponse(
        event,
        String(error.message || '').replace('VALIDATION:', ''),
      );
    }
    if (isPrismaNotFoundError(error)) {
      return notFoundResponse(event, 'Inspection record not found');
    }
    return internalServerErrorResponse(
      event,
      'Failed to update inspection record',
    );
  }
});
