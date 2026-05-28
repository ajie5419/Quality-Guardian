import { defineEventHandler } from 'h3';
import { bindRequestLogger } from '~/utils/logger';

export default defineEventHandler(async (event) => {
  const requestLogger = bindRequestLogger(event);

  event.node.res.setHeader('X-Request-Id', event.context.requestId || '');
  event.node.res.setHeader('X-Trace-Id', event.context.traceId || '');

  event.node.res.setHeader(
    'Access-Control-Allow-Origin',
    event.headers.get('Origin') ?? '*',
  );
  requestLogger.trace(
    {
      method: event.method,
      path: event.path,
    },
    'request received',
  );
  if (event.method === 'OPTIONS') {
    requestLogger.trace('OPTIONS preflight request');
    event.node.res.statusCode = 204;
    event.node.res.statusMessage = 'No Content.';
    return 'OK';
  }
  // Demo mode restriction removed to enable full CRUD operations
});
