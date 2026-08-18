import { INSPECTION_RECORD_PERMISSION_CODES } from '@qgs/shared';
import { defineEventHandler, readBody } from 'h3';
import { z } from 'zod';
import { InspectionService } from '~/modules/inspection/inspection.service';
import { authorizeWrite } from '~/modules/rbac';
import { logApiError } from '~/utils/api-logger';
import {
  badRequestResponse,
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';
import { getRequiredRouterParam } from '~/utils/route-param';

const schema = z.object({
  status: z.string(),
  workContent: z.unknown().optional(),
});

export default defineEventHandler(async (event) => {
  await authorizeWrite(event, INSPECTION_RECORD_PERMISSION_CODES.EDIT);
  const id = getRequiredRouterParam(event, 'id', 'ID required');
  if (typeof id !== 'string') return id;
  try {
    const body = schema.parse(await readBody(event));
    const status = body.status.trim().toUpperCase();
    if (!status) return badRequestResponse(event, '缺少归档状态');
    const updated = await InspectionService.updateArchiveTaskStatus({
      id,
      status: status as 'ARCHIVED' | 'IN_PROGRESS' | 'PENDING' | 'REJECTED',
      workContent:
        body.workContent === undefined
          ? undefined
          : String(body.workContent || ''),
    });
    return useResponseSuccess(updated);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '更新归档状态失败';
    logApiError('inspection-archive-task-status', error, undefined, event);
    return internalServerErrorResponse(event, message);
  }
});
