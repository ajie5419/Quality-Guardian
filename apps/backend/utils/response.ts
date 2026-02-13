import type { EventHandlerRequest, H3Event } from 'h3';

import { setResponseStatus } from 'h3';

export function useResponseSuccess<T = unknown>(data: T) {
  return {
    code: 0,
    data,
    error: null,
    message: 'ok',
  };
}

export function usePageResponseSuccess<T = unknown>(
  page: number | string,
  pageSize: number | string,
  list: T[],
  { total, message = 'ok' }: { message?: string; total?: number } = {},
) {
  const pageData =
    total === undefined
      ? pagination(
          Number.parseInt(`${page}`),
          Number.parseInt(`${pageSize}`),
          list,
        )
      : list;

  return {
    ...useResponseSuccess({
      items: pageData,
      total: total === undefined ? list.length : total,
    }),
    message,
  };
}

export function useResponseError(message: string, error: unknown = null) {
  return {
    code: -1,
    data: null,
    error,
    message,
  };
}

export function badRequestResponse(
  event: H3Event<EventHandlerRequest>,
  message: string,
  error: unknown = null,
) {
  setResponseStatus(event, 400);
  return useResponseError(message, error);
}

export function forbiddenResponse(
  event: H3Event<EventHandlerRequest>,
  message = 'Forbidden Exception',
) {
  setResponseStatus(event, 403);
  return useResponseError(message, message);
}

export function conflictResponse(
  event: H3Event<EventHandlerRequest>,
  message: string,
  error: unknown = null,
) {
  setResponseStatus(event, 409);
  return useResponseError(message, error);
}

export function notFoundResponse(
  event: H3Event<EventHandlerRequest>,
  message: string,
  error: unknown = null,
) {
  setResponseStatus(event, 404);
  return useResponseError(message, error);
}

export function unAuthorizedResponse(event: H3Event<EventHandlerRequest>) {
  setResponseStatus(event, 401);
  return useResponseError('Unauthorized Exception', 'Unauthorized Exception');
}

export function internalServerErrorResponse(
  event: H3Event<EventHandlerRequest>,
  message: string,
  error: unknown = null,
) {
  setResponseStatus(event, 500);
  return useResponseError(message, error);
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function pagination<T = unknown>(
  pageNo: number,
  pageSize: number,
  array: T[],
): T[] {
  const offset = (pageNo - 1) * Number(pageSize);
  return offset + Number(pageSize) >= array.length
    ? array.slice(offset)
    : array.slice(offset, offset + Number(pageSize));
}
