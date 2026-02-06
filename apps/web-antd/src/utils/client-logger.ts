import { sendClientLog } from '#/api/system/log';

/**
 * 设置全局错误处理器，捕获未处理的运行时错误和 Promise 拒绝
 */
export function setupClientLogger() {
  if (import.meta.env.DEV) {
    // 开发环境下可选：是否也将错误发送到后端
    // return;
  }

  window.addEventListener('error', (event) => {
    const { colno, error, filename, lineno, message } = event;

    // 过滤无害的浏览器底层噪声
    const noisePatterns = [
      'ResizeObserver loop completed with undelivered notifications',
      'ResizeObserver loop limit exceeded',
      'Script error.', // 通常是跨域脚本错误，没有有用堆栈
    ];

    if (noisePatterns.some((pattern) => String(message).includes(pattern))) {
      return;
    }

    sendClientLog({
      colno,
      lineno,
      message: String(message),
      source: filename,
      stack: error?.stack,
      type: 'onerror',
      url: window.location.href,
      userAgent: navigator.userAgent,
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    sendClientLog({
      message: event.reason?.message || String(event.reason),
      stack: event.reason?.stack,
      type: 'unhandledrejection',
      url: window.location.href,
      userAgent: navigator.userAgent,
    });
  });
}

/**
 * 手动记录远程错误
 */
export const logRemoteError = (message: string, context?: any) => {
  sendClientLog({
    type: 'manual',
    message,
    ...context,
    url: window.location.href,
    userAgent: navigator.userAgent,
  });
};
