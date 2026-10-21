import { ErrorCode } from '@qgs/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

import errorHandler from './error';
import { BusinessError } from './utils/business-error';

vi.mock('./utils/logger', () => ({ logError: vi.fn() }));

function renderError(error: Error, environment: string) {
  vi.stubEnv('NODE_ENV', environment);
  let serialized = '';
  const response = {
    statusCode: 200,
    writableEnded: false,
    end(body: string) {
      serialized = body;
    },
  };
  errorHandler(
    error as never,
    {
      method: 'GET',
      path: '/api/error-probe',
      node: { res: response },
    } as never,
    undefined,
  );
  return {
    status: response.statusCode,
    body: JSON.parse(serialized),
    serialized,
  };
}

afterEach(() => vi.unstubAllEnvs());

describe('global error response boundary', () => {
  it('hides ordinary exception details from every production response field', () => {
    const marker = 'A2_PRIVATE_DATABASE_DIAGNOSTIC';
    const error = new Error(`${marker}: internal database path`);
    error.stack = `${marker}: private stack`;

    const response = renderError(error, 'production');

    expect(response.status).toBe(500);
    expect(response.body).toMatchObject({ code: -1, error: null });
    expect(response.body).not.toHaveProperty('stack');
    expect(response.serialized).not.toContain(marker);
  });

  it('preserves an explicit business status and error code', () => {
    const response = renderError(
      new BusinessError(
        ErrorCode.CONFLICT,
        'Record changed; refresh and retry',
        409,
      ),
      'production',
    );

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      code: -1,
      error: { code: ErrorCode.CONFLICT },
      message: 'Record changed; refresh and retry',
    });
    expect(response.body).not.toHaveProperty('stack');
  });

  it('keeps diagnostic stacks limited to development responses', () => {
    const error = new Error('A2_DEVELOPMENT_DIAGNOSTIC');
    error.stack = 'A2_DEVELOPMENT_STACK';

    const response = renderError(error, 'development');

    expect(response.status).toBe(500);
    expect(response.body.stack).toBe(error.stack);
    expect(response.body.error).toBeNull();
  });
});
