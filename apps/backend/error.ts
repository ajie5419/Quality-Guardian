import type { NitroErrorHandler } from 'nitropack';

// 使用延迟加载的方式导入 logger，避免在 nitro prepare 阶段报错
let logErrorFn:
  | ((error: unknown, context?: Record<string, unknown>) => void)
  | null = null;

try {
  // 尝试动态导入 logger（仅在运行时）
  const loggerModule = require('./utils/logger');
  logErrorFn = loggerModule.logError;
} catch {
  // 在 stub/prepare 阶段忽略
}

const errorHandler: NitroErrorHandler = function (error, event) {
  // 使用 logger 或回退到 console
  if (logErrorFn) {
    logErrorFn(error, {
      handler: 'NitroErrorHandler',
      path: event?.path,
      method: event?.method,
    });
  } else {
    console.error('[Nitro Error Handler]', error);
  }

  // H3/Nitro should handle the response automatically if we don't end it manually,
  // but we can set headers/status here.
  // Using event.node.res directly is risky if H3 context is not fully standard.

  // Safe fallback
  if (event?.node?.res && !event.node.res.writableEnded) {
    event.node.res.statusCode = 500;
    event.node.res.end(
      JSON.stringify({
        code: -1,
        message: 'Internal Server Error',
        error: error.message,
        // eslint-disable-next-line n/prefer-global/process
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      }),
    );
  }
};

export default errorHandler;
