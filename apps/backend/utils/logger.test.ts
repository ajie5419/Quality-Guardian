import { describe, expect, it } from 'vitest';

import { sanitizeError } from './logger';

describe('logger error sanitization', () => {
  it('summarizes prisma unknown argument validation errors', () => {
    const error = new Error(
      [
        'Invalid `prisma.quality_records.update()` invocation:',
        '',
        'Unknown argument `workOrderNumber`. Available options are marked with ?.',
      ].join('\n'),
    );
    error.name = 'PrismaClientValidationError';
    error.stack = 'large stack';

    expect(sanitizeError(error)).toEqual({
      message: 'Prisma validation failed: unknown argument "workOrderNumber"',
      name: 'PrismaClientValidationError',
    });
  });
});
