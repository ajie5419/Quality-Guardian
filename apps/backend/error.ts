import type { NitroErrorHandler } from 'nitropack';

import { logError } from './utils/logger';

const errorHandler: NitroErrorHandler = function (error, event) {
  // 使用 logger 记录错误
  logError(error, {
    handler: 'NitroErrorHandler',
    method: event?.method,
    path: event?.path,
  });

  // H3/Nitro should handle the response automatically if we don't end it manually,
  // but we can set headers/status here.
  // Using event.node.res directly is risky if H3 context is not fully standard.

  // Safe fallback
  if (event?.node?.res && !event.node.res.writableEnded) {
    event.node.res.statusCode = 500;
    event.node.res.end(
      JSON.stringify({
        code: -1,
        error: error.message,
        message: 'Internal Server Error',
        // eslint-disable-next-line n/prefer-global/process
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      }),
    );
  }
};

export default errorHandler;
