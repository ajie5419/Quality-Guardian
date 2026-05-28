import { readBody } from 'h3';
import { z } from 'zod';
import { logApiError, logClientReport } from '~/utils/api-logger';
import { bindRequestLogger } from '~/utils/logger';
import { useResponseSuccess } from '~/utils/response';

const schema = z
  .object({
    type: z.unknown().optional(),
    message: z.unknown().optional(),
    stack: z.unknown().optional(),
    url: z.unknown().optional(),
    userAgent: z.unknown().optional(),
    severity: z.unknown().optional(),
    source: z.unknown().optional(),
    sourceFile: z.unknown().optional(),
    error: z.unknown().optional(),
    errorCode: z.unknown().optional(),
    lineno: z.unknown().optional(),
    colno: z.unknown().optional(),
    requestUrl: z.unknown().optional(),
    requestMethod: z.unknown().optional(),
    requestTimeout: z.unknown().optional(),
    responseStatus: z.unknown().optional(),
    responseStatusText: z.unknown().optional(),
  })
  .passthrough();

export default defineEventHandler(async (event) => {
  bindRequestLogger(event);
  try {
    const payload = schema.parse(await readBody(event));
    logClientReport(event, {
      endpoint: 'client-log',
      ...payload,
      recordedAt: new Date().toISOString(),
    });
    return useResponseSuccess({ message: 'Log recorded' });
  } catch (error) {
    logApiError('client-log', error, undefined, event);
    return useResponseSuccess({ message: 'Log processing attempted' });
  }
});
