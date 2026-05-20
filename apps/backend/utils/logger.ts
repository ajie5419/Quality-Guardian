/**
 * Logger - 基于 Pino 的统一日志模块
 *
 * 目标：
 * 1) 统一结构化字段，支持 traceId/requestId 全链路追踪
 * 2) 默认上下文脱敏，避免 token/password 等敏感信息泄露
 * 3) 保持对历史调用方式兼容，允许渐进迁移
 */

import type { EventHandlerRequest, H3Event } from 'h3';

import { randomUUID } from 'node:crypto';
import process from 'node:process';

import { getHeader } from 'h3';
import pino from 'pino';

const isDev = process.env.NODE_ENV !== 'production';
const LOG_LEVEL = process.env.LOG_LEVEL || (isDev ? 'debug' : 'info');
const REDACTED_VALUE = '[REDACTED]';
const SENSITIVE_KEY_PATTERN =
  /pass(?:word)?|token|secret|authorization|cookie|api[-_]?key|session/i;

const REQUEST_ID_HEADER = 'x-request-id';
const TRACE_ID_HEADER = 'x-trace-id';

type LogMethod = (objOrMsg?: unknown, msg?: string) => void;

export interface LoggerLike {
  child: (bindings: Record<string, unknown>) => LoggerLike;
  debug: LogMethod;
  error: LogMethod;
  fatal: LogMethod;
  info: LogMethod;
  trace: LogMethod;
  warn: LogMethod;
}

export interface RequestLogContext {
  method?: string;
  path?: string;
  requestId: string;
  traceId: string;
  userId?: string;
}

interface SanitizerState {
  depth: number;
  seen: WeakSet<object>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeLogInput(
  objOrMsg?: unknown,
  msg?: string,
): { data: Record<string, unknown>; message?: string } {
  if (typeof objOrMsg === 'string') {
    return { data: {}, message: objOrMsg };
  }

  if (isRecord(objOrMsg)) {
    return { data: objOrMsg, message: msg };
  }

  if (objOrMsg === undefined) {
    return { data: {}, message: msg };
  }

  return {
    data: { value: objOrMsg },
    message: msg,
  };
}

function sanitizeError(error: Error) {
  return {
    message: error.message,
    name: error.name,
    stack: error.stack,
  };
}

function sanitizeValue(value: unknown, state: SanitizerState): unknown {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) return sanitizeError(value);
  if (typeof value === 'bigint') return value.toString();
  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'string'
  ) {
    return value;
  }

  if (!isRecord(value) && !Array.isArray(value)) {
    return String(value);
  }

  if (state.depth > 6) return '[MaxDepth]';
  if (isRecord(value) && state.seen.has(value)) return '[Circular]';
  if (isRecord(value)) state.seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) =>
      sanitizeValue(item, {
        depth: state.depth + 1,
        seen: state.seen,
      }),
    );
  }

  const next: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      next[key] = REDACTED_VALUE;
      continue;
    }

    next[key] = sanitizeValue(raw, {
      depth: state.depth + 1,
      seen: state.seen,
    });
  }
  return next;
}

export function sanitizeContext(
  context?: Record<string, unknown>,
): Record<string, unknown> {
  if (!context) return {};
  return sanitizeValue(context, {
    depth: 0,
    seen: new WeakSet<object>(),
  }) as Record<string, unknown>;
}

function createConsoleMethod(
  level: 'debug' | 'error' | 'fatal' | 'info' | 'trace' | 'warn',
  bindings: Record<string, unknown>,
): LogMethod {
  return (objOrMsg?: unknown, msg?: string) => {
    const { data, message } = normalizeLogInput(objOrMsg, msg);
    const merged = sanitizeContext({
      ...bindings,
      ...data,
    });

    if (level === 'trace' && LOG_LEVEL !== 'trace') return;
    if (level === 'debug' && !['debug', 'trace'].includes(LOG_LEVEL)) return;

    /* eslint-disable no-console */
    switch (level) {
      case 'debug': {
        console.debug('[DEBUG]', merged, message);

        break;
      }
      case 'error':
      case 'fatal': {
        console.error(`[${level.toUpperCase()}]`, merged, message);

        break;
      }
      case 'trace': {
        console.debug('[TRACE]', merged, message);

        break;
      }
      case 'warn': {
        console.warn('[WARN]', merged, message);

        break;
      }
      default: {
        console.info('[INFO]', merged, message);
      }
    }
    /* eslint-enable no-console */
  };
}

const createConsoleLogger = (
  bindings: Record<string, unknown> = {},
): LoggerLike => ({
  child: (newBindings: Record<string, unknown>) =>
    createConsoleLogger({ ...bindings, ...newBindings }),
  debug: createConsoleMethod('debug', bindings),
  error: createConsoleMethod('error', bindings),
  fatal: createConsoleMethod('fatal', bindings),
  info: createConsoleMethod('info', bindings),
  trace: createConsoleMethod('trace', bindings),
  warn: createConsoleMethod('warn', bindings),
});

function withSanitizer(target: LoggerLike): LoggerLike {
  const wrap = (method: LogMethod): LogMethod => {
    return (objOrMsg?: unknown, msg?: string) => {
      const { data, message } = normalizeLogInput(objOrMsg, msg);
      method(sanitizeContext(data), message);
    };
  };

  return {
    child(bindings: Record<string, unknown>) {
      return withSanitizer(target.child(sanitizeContext(bindings)));
    },
    debug: wrap(target.debug.bind(target)),
    error: wrap(target.error.bind(target)),
    fatal: wrap(target.fatal.bind(target)),
    info: wrap(target.info.bind(target)),
    trace: wrap(target.trace.bind(target)),
    warn: wrap(target.warn.bind(target)),
  };
}

const getBaseOptions = (): pino.LoggerOptions => ({
  level: LOG_LEVEL,
  base: {
    app: 'qgs-backend',
    env: process.env.NODE_ENV || 'development',
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level: (label: string) => ({ level: label }),
  },
});

function createLogger(): LoggerLike {
  try {
    const baseOptions = getBaseOptions();

    if (isDev) {
      try {
        return withSanitizer(
          pino(
            baseOptions,
            pino.transport({
              target: 'pino-pretty',
              options: {
                colorize: true,
                ignore: 'pid,hostname',
                translateTime: 'SYS:standard',
              },
            }),
          ) as unknown as LoggerLike,
        );
      } catch {
        return withSanitizer(pino(baseOptions) as unknown as LoggerLike);
      }
    }

    return withSanitizer(pino(baseOptions) as unknown as LoggerLike);
  } catch {
    console.warn('[Logger] pino initialization failed, using console fallback');
    return createConsoleLogger({
      app: 'qgs-backend',
      env: process.env.NODE_ENV || 'development',
    });
  }
}

function pickHeaderValue(raw: string | undefined) {
  if (!raw) return undefined;
  const value = raw.split(',')[0]?.trim();
  return value || undefined;
}

function makeGeneratedId() {
  return randomUUID().replaceAll('-', '');
}

export function resolveRequestLogContext(
  event: H3Event<EventHandlerRequest>,
): RequestLogContext {
  const requestId =
    pickHeaderValue(getHeader(event, REQUEST_ID_HEADER)) || makeGeneratedId();
  const traceId =
    pickHeaderValue(getHeader(event, TRACE_ID_HEADER)) || requestId;

  return {
    method: event.method || event.node.req.method || undefined,
    path: event.path || event.node.req.url || undefined,
    requestId,
    traceId,
    userId: event.context.userId,
  };
}

const logger = createLogger();

export { logger };

export function createModuleLogger(moduleName: string): LoggerLike {
  return logger.child({ module: moduleName });
}

export function createRequestLogger(
  requestId: string,
  path: string,
): LoggerLike;
export function createRequestLogger(context: RequestLogContext): LoggerLike;
export function createRequestLogger(
  requestIdOrContext: RequestLogContext | string,
  path?: string,
): LoggerLike {
  if (typeof requestIdOrContext === 'string') {
    return logger.child({
      path,
      requestId: requestIdOrContext,
      traceId: requestIdOrContext,
    });
  }

  return logger.child({
    ...requestIdOrContext,
  });
}

export function bindRequestLogger(
  event: H3Event<EventHandlerRequest>,
  context?: Partial<RequestLogContext>,
) {
  const resolved = {
    ...resolveRequestLogContext(event),
    ...context,
  };
  const requestLogger = createRequestLogger(resolved);
  event.context.requestId = resolved.requestId;
  event.context.traceId = resolved.traceId;
  if (resolved.userId) {
    event.context.userId = resolved.userId;
  }
  event.context.logger = requestLogger;
  return requestLogger;
}

export function getRequestLogger(event: H3Event<EventHandlerRequest>) {
  return event.context.logger || bindRequestLogger(event);
}

export function logError(
  error: Error | unknown,
  context?: Record<string, unknown>,
) {
  if (error instanceof Error) {
    logger.error(
      {
        err: sanitizeError(error),
        ...sanitizeContext(context),
      },
      'Unhandled error',
    );
    return;
  }

  logger.error(
    {
      err: sanitizeValue(error, {
        depth: 0,
        seen: new WeakSet<object>(),
      }),
      ...sanitizeContext(context),
    },
    'Unhandled error',
  );
}

export function logPerformance(
  operation: string,
  durationMs: number,
  context?: Record<string, unknown>,
) {
  logger.info({
    durationMs,
    operation,
    type: 'performance',
    ...sanitizeContext(context),
  });
}

export function logAudit(
  action: string,
  userId: string,
  details?: Record<string, unknown>,
) {
  logger.info({
    action,
    type: 'audit',
    userId,
    ...sanitizeContext(details),
  });
}

export default logger;
