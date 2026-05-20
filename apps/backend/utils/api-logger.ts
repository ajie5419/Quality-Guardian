/**
 * API Logger - API 端点专用日志工具
 * 简化 API 层的日志迁移
 */

import type { EventHandlerRequest, H3Event } from 'h3';

import {
  createModuleLogger,
  getRequestLogger,
  sanitizeContext,
} from './logger';

// 创建 API 专用 logger
const apiLogger = createModuleLogger('API');
const clientLogger = createModuleLogger('ClientReport');

function getBaseApiContext(
  event?: H3Event<EventHandlerRequest>,
): Record<string, unknown> {
  if (!event) return {};
  return {
    method: event.method || event.node.req.method,
    path: event.path || event.node.req.url,
    requestId: event.context.requestId,
    traceId: event.context.traceId,
    userId: event.context.userId,
  };
}

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
  event?: H3Event<EventHandlerRequest>,
) {
  const mergedContext = sanitizeContext({
    endpoint,
    ...getBaseApiContext(event),
    ...context,
  });
  const targetLogger = event ? getRequestLogger(event) : apiLogger;

  if (error instanceof Error) {
    targetLogger.error(
      {
        ...mergedContext,
        err: {
          message: error.message,
          name: error.name,
          stack: error.stack,
        },
      },
      `${endpoint} exception`,
    );
  } else {
    targetLogger.error(
      {
        ...mergedContext,
        err: error,
      },
      `${endpoint} exception`,
    );
  }
}

/**
 * 记录 API 警告
 */
export function logApiWarn(
  endpoint: string,
  message: string,
  context?: Record<string, unknown>,
  event?: H3Event<EventHandlerRequest>,
) {
  const targetLogger = event ? getRequestLogger(event) : apiLogger;
  targetLogger.warn(
    sanitizeContext({
      endpoint,
      ...getBaseApiContext(event),
      ...context,
    }),
    message,
  );
}

/**
 * 记录 API 调试信息
 */
export function logApiDebug(
  endpoint: string,
  message: string,
  context?: Record<string, unknown>,
  event?: H3Event<EventHandlerRequest>,
) {
  const targetLogger = event ? getRequestLogger(event) : apiLogger;
  targetLogger.debug(
    sanitizeContext({
      endpoint,
      ...getBaseApiContext(event),
      ...context,
    }),
    message,
  );
}

/**
 * 记录客户端上报日志（不是 API 失败）
 */
export function logClientReport(
  event: H3Event<EventHandlerRequest>,
  payload: Record<string, unknown>,
) {
  const requestLogger = getRequestLogger(event);
  const context = sanitizeContext({
    ...getBaseApiContext(event),
    ...payload,
  });

  requestLogger.info(context, 'client-report received');
  clientLogger.info(context, 'client-report received');
}

export { apiLogger, clientLogger };
