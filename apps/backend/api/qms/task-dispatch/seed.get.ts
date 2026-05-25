import { defineEventHandler } from 'h3';
import { TaskDispatchService } from '~/modules/task-dispatch/task-dispatch.service';
import {
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  try {
    await TaskDispatchService.seed();
    return useResponseSuccess({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Seed failed';
    return internalServerErrorResponse(event, message);
  }
});
