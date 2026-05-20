import type { LoggerLike } from './utils/logger';

declare module 'h3' {
  interface H3EventContext {
    logger?: LoggerLike;
    requestId?: string;
    traceId?: string;
    userId?: string;
  }
}
