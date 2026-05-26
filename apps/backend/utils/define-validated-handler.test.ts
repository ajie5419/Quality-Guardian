import { describe, expect, it, vi } from 'vitest';

import { defineValidatedHandler } from './define-validated-handler';

vi.mock('h3', () => ({
  defineEventHandler: (handler: unknown) => handler,
  getMethod: (event: { method?: string }) => event.method || 'GET',
  getQuery: (event: { query?: unknown }) => event.query || {},
  readBody: (event: { body?: unknown }) => Promise.resolve(event.body || {}),
}));

describe('defineValidatedHandler', () => {
  const schema = {
    parse(input: unknown) {
      return input as { value?: string };
    },
  };

  it('uses query params for GET requests', async () => {
    const handler = defineValidatedHandler(schema, (_event, input) => input);

    await expect(
      handler({ method: 'GET', query: { value: 'from-query' } } as never),
    ).resolves.toEqual({ value: 'from-query' });
  });

  it('uses request body for write requests', async () => {
    const handler = defineValidatedHandler(schema, (_event, input) => input);

    await expect(
      handler({ body: { value: 'from-body' }, method: 'POST' } as never),
    ).resolves.toEqual({ value: 'from-body' });
  });
});
