/**
 * API Logger - API 端点专用日志工具
 * 简化 API 层的日志迁移
 */

import { createModuleLogger } from './logger';

// 创建 API 专用 logger
const apiLogger = createModuleLogger('API');

/**
 * 记录 API 错误
 * @param endpoint - API 端点名称
 * @param error - 错误对象
 * @param context - 额外上下文
 */
export function logApiError(
  endpoint: string,
  error: unknown,
  context?: Record<string, unknown>,
) {
  if (error instanceof Error) {
    apiLogger.error(
      {
        endpoint,
        err: {
          message: error.message,
          name: error.name,
          stack: error.stack,
        },
        ...context,
      },
      `${endpoint} failed`,
    );
  } else {
    apiLogger.error({ endpoint, err: error, ...context }, `${endpoint} failed`);
  }
}

/**
 * 记录 API 警告
 */
export function logApiWarn(
  endpoint: string,
  message: string,
  context?: Record<string, unknown>,
) {
  apiLogger.warn({ endpoint, ...context }, message);
}

/**
 * 记录 API 调试信息
 */
export function logApiDebug(
  endpoint: string,
  message: string,
  context?: Record<string, unknown>,
) {
  apiLogger.debug({ endpoint, ...context }, message);
}

export { apiLogger };
