import { defineEventHandler } from 'h3';
import { SystemLogService } from '~/services/system-log.service';
import { useResponseError, useResponseSuccess } from '~/utils/response';

export default defineEventHandler(async (event) => {
  const id = event.context.params?.id;

  if (!id) {
    return useResponseError('BadRequestException', 'Log ID is required');
  }

  try {
    await SystemLogService.deleteLog(id);
    return useResponseSuccess({ message: 'Log deleted successfully' });
  } catch (error: any) {
    return useResponseError('InternalServerError', error.message);
  }
});
