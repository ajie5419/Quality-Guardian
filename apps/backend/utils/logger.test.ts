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

  it('keeps the root cause line for prisma invalid invocation errors', () => {
    const error = new Error(
      [
        'Invalid `prisma.menus.findFirst()` invocation:',
        '',
        'The column `menus.isDeleted` does not exist in the current database.',
      ].join('\n'),
    );
    error.name = 'PrismaClientKnownRequestError';

    expect(sanitizeError(error)).toEqual({
      message:
        'Invalid `prisma.menus.findFirst()` invocation: The column `menus.isDeleted` does not exist in the current database.',
      name: 'PrismaClientKnownRequestError',
    });
  });
});
