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

const createConsoleLogger = (
  bindings: Record<string, unknown> = {},
): LoggerLike => ({
  child: (newBindings: Record<string, unknown>) =>
    createConsoleLogger({ ...bindings, ...newBindings }),
  trace: (obj: unknown, msg?: string) => {
    if (LOG_LEVEL === 'trace') {
      console.debug('[TRACE]', { ...bindings, ...formatLogObj(obj) }, msg);
    }
  },
  debug: (obj: unknown, msg?: string) => {
    if (['trace', 'debug'].includes(LOG_LEVEL)) {
      console.debug('[DEBUG]', { ...bindings, ...formatLogObj(obj) }, msg);
    }
  },
  info: (obj: unknown, msg?: string) => {
    console.info('[INFO]', { ...bindings, ...formatLogObj(obj) }, msg);
  },
  warn: (obj: unknown, msg?: string) => {
    console.warn('[WARN]', { ...bindings, ...formatLogObj(obj) }, msg);
  },
  error: (obj: unknown, msg?: string) => {
    console.error('[ERROR]', { ...bindings, ...formatLogObj(obj) }, msg);
  },
  fatal: (obj: unknown, msg?: string) => {
    console.error('[FATAL]', { ...bindings, ...formatLogObj(obj) }, msg);
  },
});

function formatLogObj(obj: unknown): Record<string, unknown> {
  if (obj && typeof obj === 'object') {
    return obj as Record<string, unknown>;
  }
  return { value: obj };
}

// ============ Logger 实例创建 ============

let logger: LoggerLike;

try {
  // 尝试动态加载 pino
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pino = require('pino');

  const baseOptions = {
    level: LOG_LEVEL,
    base: {
      app: 'qgs-backend',
      env: process.env.NODE_ENV || 'development',
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level: (label: string) => ({ level: label }),
    },
  };

  // 开发环境使用 pino-pretty（如果可用）
  if (isDev) {
    try {
      logger = pino(
        baseOptions,
        pino.transport({
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
          },
        }),
      );
    } catch {
      // pino-pretty 不可用，使用普通 pino
      logger = pino(baseOptions);
    }
  } else {
    logger = pino(baseOptions);
  }
} catch {
  // pino 不可用，使用 console 备用方案
  console.warn('[Logger] pino not available, using console fallback');
  logger = createConsoleLogger({
    app: 'qgs-backend',
    env: process.env.NODE_ENV || 'development',
  });
}

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
    type: 'performance',
    operation,
    durationMs,
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
    type: 'audit',
    action,
    userId,
    ...details,
  });
}

// ============ 导出默认实例 ============

export default logger;
