import { TASK_DISPATCH_PERMISSION_CODES } from '@qgs/shared';
import { defineEventHandler } from 'h3';
import { authorizeWrite } from '~/modules/rbac';
import { TaskDispatchService } from '~/modules/task-dispatch/task-dispatch.service';
import { logApiError } from '~/utils/api-logger';
import {
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  await authorizeWrite(event, TASK_DISPATCH_PERMISSION_CODES.CREATE);
  try {
    await TaskDispatchService.seed();
    return useResponseSuccess({ success: true });
  } catch (error: unknown) {
    logApiError('task-dispatch-seed', error, undefined, event);
    return internalServerErrorResponse(event, 'Task seed failed');
  }
});
