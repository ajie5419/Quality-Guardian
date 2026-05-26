import type { EventHandlerRequest, H3Event } from 'h3';

import { defineEventHandler, getMethod, getQuery, readBody } from 'h3';

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
    const input = schema.parse(rawInput);
    return handler(event, input);
  });
}
