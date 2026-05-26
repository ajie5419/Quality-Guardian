import type { EventHandlerRequest, H3Event } from 'h3';

import { setResponseStatus } from 'h3';

import { useResponseError } from './response';

export class BusinessError extends Error {
  constructor(
    public readonly code: string,
    message?: string,
    public readonly httpStatus: number = 400,
  ) {
    super(message || code);
    this.name = 'BusinessError';
  }
}

export function isBusinessError(error: unknown): error is BusinessError {
  return error instanceof BusinessError;
}

export function businessErrorResponse(
  event: H3Event<EventHandlerRequest>,
  error: BusinessError,
) {
  setResponseStatus(event, error.httpStatus);
  return useResponseError(error.message, {
    code: error.code,
  });
}

export function legacyErrorToBusinessError(error: unknown) {
  if (isBusinessError(error)) return error;
  if (!(error instanceof Error)) return null;

  if (error.message.startsWith('VALIDATION:')) {
    return new BusinessError(
      'VALIDATION',
      error.message.replace('VALIDATION:', ''),
    );
  }
  if (error.message.startsWith('NOT_FOUND:')) {
    return new BusinessError(
      'NOT_FOUND',
      error.message.replace('NOT_FOUND:', ''),
      404,
    );
  }
  if (error.message === 'NOT_FOUND') {
    return new BusinessError('NOT_FOUND', 'Not found', 404);
  }
  if (error.message.startsWith('BAD_REQUEST:')) {
    return new BusinessError(
      'BAD_REQUEST',
      error.message.replace('BAD_REQUEST:', ''),
    );
  }
  if (error.message.startsWith('DUPLICATE_')) {
    return new BusinessError(error.message, error.message, 409);
  }
  if (error.message.startsWith('FORBIDDEN_')) {
    return new BusinessError(error.message, error.message, 403);
  }

  return null;
}
