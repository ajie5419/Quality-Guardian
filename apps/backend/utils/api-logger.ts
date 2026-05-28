/**
 * API Logger - API 端点专用日志工具
 * 简化 API 层的日志迁移
 */

import type { EventHandlerRequest, H3Event } from 'h3';

import {
  createModuleLogger,
  getRequestLogger,
  sanitizeContext,
  sanitizeError,
} from './logger';

// 创建 API 专用 logger
const apiLogger = createModuleLogger('API');
const clientLogger = createModuleLogger('ClientReport');
const ERROR_CLIENT_LOG_TYPES = new Set([
  'component',
  'onerror',
  'unhandledrejection',
]);
const WARN_CLIENT_LOG_TYPES = new Set(['manual']);

type ClientLogLevel = 'error' | 'info' | 'warn';

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
        err: sanitizeError(error),
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
  const level = resolveClientLogLevel(payload);
  const context = sanitizeContext({
    ...getBaseApiContext(event),
    ...payload,
    level,
  });

  requestLogger[level](context, 'client-report received');
  clientLogger[level](context, 'client-report received');
}

export { apiLogger, clientLogger };

function resolveClientLogLevel(
  payload: Record<string, unknown>,
): ClientLogLevel {
  const severity = payload.severity;
  if (severity === 'error' || severity === 'warn' || severity === 'info') {
    return severity;
  }

  const type = typeof payload.type === 'string' ? payload.type : '';
  if (ERROR_CLIENT_LOG_TYPES.has(type)) return 'error';
  if (WARN_CLIENT_LOG_TYPES.has(type)) return 'warn';

  return 'info';
}
