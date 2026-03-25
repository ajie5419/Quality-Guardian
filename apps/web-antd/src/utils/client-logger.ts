import { sendClientLog } from '#/api/system/log';

function serializeUnknownError(error: unknown) {
  if (!error) {
    return { error: 'Unknown error' };
  }

  if (error instanceof Error) {
    const typedError = error as Error & {
      code?: string;
      config?: { method?: string; timeout?: number; url?: string };
      response?: { data?: unknown; status?: number; statusText?: string };
    };

    return {
      error: typedError.message,
      errorCode: typedError.code,
      requestMethod: typedError.config?.method,
      requestTimeout: typedError.config?.timeout,
      requestUrl: typedError.config?.url,
      response: typedError.response?.data,
      responseStatus: typedError.response?.status,
      responseStatusText: typedError.response?.statusText,
      stack: typedError.stack,
    };
  }

  if (typeof error === 'object') {
    const typedError = error as {
      code?: string;
      config?: { method?: string; timeout?: number; url?: string };
      message?: string;
      response?: { data?: unknown; status?: number; statusText?: string };
      stack?: string;
    };

    return {
      error: typedError.message || JSON.stringify(error),
      errorCode: typedError.code,
      requestMethod: typedError.config?.method,
      requestTimeout: typedError.config?.timeout,
      requestUrl: typedError.config?.url,
      response: typedError.response?.data,
      responseStatus: typedError.response?.status,
      responseStatusText: typedError.response?.statusText,
      stack: typedError.stack,
    };
  }

  return { error: String(error) };
}

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
    const reason = event.reason as {
      code?: string;
      config?: { url?: string };
      message?: string;
      stack?: string;
    };
    const message = reason?.message || String(reason);
    const isNetworkError =
      reason?.code === 'ECONNABORTED' ||
      reason?.code === 'ERR_NETWORK' ||
      /network error|timeout/i.test(message);
    const isClientLogRequest =
      reason?.config?.url?.includes('/system/log/client') ?? false;

    // 网络异常在离线/后端停机时会大量出现，避免控制台和上报风暴。
    if (isNetworkError || isClientLogRequest) {
      event.preventDefault();
      return;
    }

    sendClientLog({
      ...serializeUnknownError(reason),
      message,
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
  const { originalError, ...restContext } = context || {};
  sendClientLog({
    type: 'manual',
    message,
    ...serializeUnknownError(originalError),
    ...restContext,
    url: window.location.href,
    userAgent: navigator.userAgent,
  });
};
