import type { EventHandlerRequest, H3Event } from 'h3';

import {
  defineEventHandler,
  getMethod,
  getQuery,
  readBody,
  setResponseStatus,
} from 'h3';

import { logApiError } from './api-logger';
import { useResponseError } from './response';

export function defineValidatedHandler<TInput>(
  schema: {
    parse(input: unknown): TInput;
  },
  handler: (event: H3Event<EventHandlerRequest>, input: TInput) => unknown,
) {
  return defineEventHandler(async (event) => {
    const method = getMethod(event).toUpperCase();
    const rawInput =
      method === 'GET' || method === 'HEAD'
        ? getQuery(event)
        : await readBody(event);
    try {
      return handler(event, schema.parse(rawInput));
    } catch (error) {
      // A schema rejection is a client error, not a server fault. Without
      // this translation a ZodError would escape to the Nitro error handler
      // and surface as HTTP 500 for ordinary validation failures.
      logApiError('define-validated-handler', error);
      if (isZodError(error)) {
        setResponseStatus(event, 400);
        return useResponseError(describeZodError(error), {
          code: 'VALIDATION',
          issues: error.issues,
        });
      }
      throw error;
    }
  });
}

function isZodError(error: unknown): error is {
  issues: Array<{ message?: string; path?: Array<number | string> }>;
  name: string;
} {
  return (
    error instanceof Error &&
    error.name === 'ZodError' &&
    Array.isArray((error as { issues?: unknown }).issues)
  );
}

function describeZodError(error: {
  issues: Array<{ message?: string; path?: Array<number | string> }>;
}) {
  const [first] = error.issues;
  if (!first) return '参数校验失败';
  const path = (first.path || []).join('.');
  return path
    ? `${path}: ${first.message || '参数校验失败'}`
    : first.message || '参数校验失败';
}
