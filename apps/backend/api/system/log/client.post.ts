import { readBody } from 'h3';
import { logApiError } from '~/utils/api-logger';
import { useResponseSuccess } from '~/utils/response';

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event);

    // 记录来自前端的错误
    logApiError('client-log', body.message || 'Client error reported', {
      ...body,
      recordedAt: new Date().toISOString(),
    });

    return useResponseSuccess({ message: 'Log recorded' });
  } catch {
    // 即使记录日志本身出错，也不要抛出异常给前端
    return useResponseSuccess({ message: 'Log processing attempted' });
  }
});
