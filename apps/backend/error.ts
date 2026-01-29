import type { NitroErrorHandler } from 'nitropack';

const errorHandler: NitroErrorHandler = function (error, event) {
  console.error('[Nitro Error Handler]', error);
  
  // H3/Nitro should handle the response automatically if we don't end it manually,
  // but we can set headers/status here.
  // Using event.node.res directly is risky if H3 context is not fully standard.
  
  // Safe fallback
  if (event?.node?.res && !event.node.res.writableEnded) {
    event.node.res.statusCode = 500;
    event.node.res.end(JSON.stringify({
      code: -1,
      message: 'Internal Server Error',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }));
  }
};

export default errorHandler;
