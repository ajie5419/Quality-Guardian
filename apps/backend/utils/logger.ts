/**
 * Logger - 基于 Pino 的日志系统（带备用方案）
 *
 * 功能特性：
 * - 结构化 JSON 日志（生产环境）
 * - 美化输出（开发环境）
 * - 日志级别控制
 * - 预留日志收集平台接入点
 * - 备用 console 日志（当 pino 不可用时）
 */

import process from 'node:process';

import pino from 'pino';

// ============ 配置 ============

const isDev = process.env.NODE_ENV !== 'production';
const LOG_LEVEL = process.env.LOG_LEVEL || (isDev ? 'debug' : 'info');

// ============ 备用 Logger（Console-based）============

interface LoggerLike {
  child: (bindings: Record<string, unknown>) => LoggerLike;
  debug: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
  fatal: (obj: unknown, msg?: string) => void;
  info: (obj: unknown, msg?: string) => void;
  trace: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
}

function formatLogObj(obj: unknown): Record<string, unknown> {
  if (obj && typeof obj === 'object') {
    return obj as Record<string, unknown>;
  }
  return { value: obj };
}

const createConsoleLogger = (
  bindings: Record<string, unknown> = {},
): LoggerLike => ({
  child: (newBindings: Record<string, unknown>) =>
    createConsoleLogger({ ...bindings, ...newBindings }),
  debug: (obj: unknown, msg?: string) => {
    if (['debug', 'trace'].includes(LOG_LEVEL)) {
      /* eslint-disable no-console */
      console.debug('[DEBUG]', { ...bindings, ...formatLogObj(obj) }, msg);
      /* eslint-enable no-console */
    }
  },
  error: (obj: unknown, msg?: string) => {
    console.error('[ERROR]', { ...bindings, ...formatLogObj(obj) }, msg);
  },
  fatal: (obj: unknown, msg?: string) => {
    console.error('[FATAL]', { ...bindings, ...formatLogObj(obj) }, msg);
  },
  info: (obj: unknown, msg?: string) => {
    /* eslint-disable no-console */
    console.info('[INFO]', { ...bindings, ...formatLogObj(obj) }, msg);
    /* eslint-enable no-console */
  },
  trace: (obj: unknown, msg?: string) => {
    if (LOG_LEVEL === 'trace') {
      /* eslint-disable no-console */
      console.debug('[TRACE]', { ...bindings, ...formatLogObj(obj) }, msg);
      /* eslint-enable no-console */
    }
  },
  warn: (obj: unknown, msg?: string) => {
    console.warn('[WARN]', { ...bindings, ...formatLogObj(obj) }, msg);
  },
});

// ============ Logger 实例创建 ============

const getBaseOptions = () => ({
  level: LOG_LEVEL,
  base: {
    app: 'qgs-backend',
    env: process.env.NODE_ENV || 'development',
  },
  timestamp: () =>
    `,"time":"${new Date().toLocaleString('zh-CN', { hour12: false }).replaceAll('/', '-')}"`,
  formatters: {
    level: (label: string) => ({ level: label }),
  },
});

const createLogger = (): LoggerLike => {
  try {
    const baseOptions = getBaseOptions();

    // 开发环境使用 pino-pretty（如果可用）
    if (isDev) {
      try {
        return pino(
          baseOptions,
          pino.transport({
            target: 'pino-pretty',
            options: {
              colorize: true,
              ignore: 'pid,hostname',
              translateTime: 'SYS:standard',
            },
          }),
        ) as unknown as LoggerLike;
      } catch {
        // pino-pretty 不可用，使用普通 pino
        return pino(baseOptions) as unknown as LoggerLike;
      }
    } else {
      return pino(baseOptions) as unknown as LoggerLike;
    }
  } catch {
    // pino 不可用，使用 console 备用方案

    console.warn('[Logger] pino initialization failed, using console fallback');

    return createConsoleLogger({
      app: 'qgs-backend',
      env: process.env.NODE_ENV || 'development',
    });
  }
};

const logger = createLogger();

// ============ 导出 Logger ============

export { logger };

// ============ 便捷方法 ============

/**
 * 创建带模块名的子 logger
 */
export function createModuleLogger(moduleName: string): LoggerLike {
  return logger.child({ module: moduleName });
}

/**
 * 请求级别日志（用于 API 端点）
 */
export function createRequestLogger(
  requestId: string,
  path: string,
): LoggerLike {
  return logger.child({ requestId, path });
}

// ============ 全局错误日志 ============

export function logError(
  error: Error | unknown,
  context?: Record<string, unknown>,
) {
  if (error instanceof Error) {
    logger.error({
      err: {
        message: error.message,
        name: error.name,
        stack: error.stack,
      },
      ...context,
    });
  } else {
    logger.error({ err: error, ...context });
  }
}

// ============ 性能日志 ============

export function logPerformance(
  operation: string,
  durationMs: number,
  context?: Record<string, unknown>,
) {
  logger.info({
    durationMs,
    operation,
    type: 'performance',
    ...context,
  });
}

// ============ 审计日志 ============

export function logAudit(
  action: string,
  userId: string,
  details?: Record<string, unknown>,
) {
  logger.info({
    action,
    type: 'audit',
    userId,
    ...details,
  });
}

// ============ 导出默认实例 ============

export default logger;
