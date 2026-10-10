import { describe, expect, it, vi } from 'vitest';

import { defineValidatedHandler } from './define-validated-handler';

// The architecture rule B-E2 requires every catch block to record the error
// through an approved logger; asserting the call keeps that contract from
// silently regressing.
const logApiError = vi.fn();
vi.mock('./api-logger', () => ({
  logApiError: (...args: unknown[]) => logApiError(...args),
}));

vi.mock('h3', () => ({
  defineEventHandler: (handler: unknown) => handler,
  getMethod: (event: { method?: string }) => event.method || 'GET',
  getQuery: (event: { query?: unknown }) => event.query || {},
  readBody: (event: { body?: unknown }) => Promise.resolve(event.body || {}),
  setResponseStatus: (event: { status?: number }, status: number) => {
    event.status = status;
  },
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

  /**
   * Regression: a schema rejection used to escape as a raw ZodError and reach
   * the Nitro error handler as HTTP 500. It must surface as a 400 client error.
   */
  it('translates a ZodError into a 400 response', async () => {
    logApiError.mockClear();
    const event: { body?: unknown; method?: string; status?: number } = {
      body: {},
      method: 'POST',
    };
    const handler = defineValidatedHandler(
      {
        parse() {
          const error = new Error('invalid payload');
          error.name = 'ZodError';
          (error as unknown as { issues: unknown[] }).issues = [
            { message: 'Unrecognized key(s) in object', path: [] },
          ];
          throw error;
        },
      },
      () => ({ unreachable: true }),
    );

    const result = (await handler(event as never)) as {
      code: number;
      message: string;
    };
    expect(event.status).toBe(400);
    expect(result.code).toBe(-1);
    expect(result.message).toContain('Unrecognized key(s) in object');
    expect(logApiError).toHaveBeenCalledTimes(1);
  });

  it('rethrows non-validation errors unchanged', async () => {
    logApiError.mockClear();
    const handler = defineValidatedHandler(
      {
        parse() {
          throw new Error('unexpected');
        },
      },
      () => ({ unreachable: true }),
    );

    await expect(
      handler({ body: {}, method: 'POST' } as never),
    ).rejects.toThrow('unexpected');
    expect(logApiError).toHaveBeenCalledTimes(1);
  });
});
