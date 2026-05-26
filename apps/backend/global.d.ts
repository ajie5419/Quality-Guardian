import type { UserSession } from './utils/jwt-utils';
import type { LoggerLike } from './utils/logger';

declare module 'h3' {
  interface H3EventContext {
    logger?: LoggerLike;
    user?: UserSession;
    requestId?: string;
    traceId?: string;
    userId?: string;
  }
}
