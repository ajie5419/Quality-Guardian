import { readBody } from 'h3';
import { logApiError, logClientReport } from '~/utils/api-logger';
import { bindRequestLogger } from '~/utils/logger';
import { useResponseSuccess } from '~/utils/response';

const CLIENT_REPORT_ALLOWED_FIELDS = new Set([
  'colno',
  'error',
  'errorCode',
  'lineno',
  'message',
  'requestMethod',
  'requestTimeout',
  'requestUrl',
  'responseStatus',
  'responseStatusText',
  'source',
  'stack',
  'type',
  'url',
  'userAgent',
]);

function pickClientReportPayload(body: unknown) {
  if (!body || typeof body !== 'object') return {};
  const source = body as Record<string, unknown>;
  const picked: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(source)) {
    if (!CLIENT_REPORT_ALLOWED_FIELDS.has(key)) continue;
    picked[key] = value;
  }

  return picked;
}

export default defineEventHandler(async (event) => {
  bindRequestLogger(event);
  try {
    const body = await readBody(event);
    const payload = pickClientReportPayload(body);

    logClientReport(event, {
      endpoint: 'client-log',
      ...payload,
      recordedAt: new Date().toISOString(),
    });

    return useResponseSuccess({ message: 'Log recorded' });
  } catch (error) {
    logApiError('client-log', error, undefined, event);
    // 即使记录日志本身出错，也不要抛出异常给前端
    return useResponseSuccess({ message: 'Log processing attempted' });
  }
});
