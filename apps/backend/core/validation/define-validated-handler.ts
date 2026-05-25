import type { EventHandlerRequest, H3Event } from 'h3';

import { defineEventHandler, getQuery } from 'h3';

export function defineValidatedHandler<TInput>(
  schema: {
    parse(input: unknown): TInput;
  },
  handler: (event: H3Event<EventHandlerRequest>, input: TInput) => unknown,
) {
  return defineEventHandler(async (event) => {
    const input = schema.parse(getQuery(event));
    return handler(event, input);
  });
}
