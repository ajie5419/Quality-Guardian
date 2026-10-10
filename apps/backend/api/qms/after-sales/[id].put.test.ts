import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authorizeWrite } from '~/modules/rbac';
import { BusinessError, businessErrorResponse } from '~/utils/business-error';

import deleteHandler from './[id].delete';
import editHandler from './[id].put';

const mocks = vi.hoisted(() => ({ edit: vi.fn(), remove: vi.fn() }));
vi.mock('~/modules/rbac', () => ({ authorizeWrite: vi.fn() }));
vi.mock('~/modules/after-sales/after-sales-id.put.service', () => ({
  default: mocks.edit,
}));
vi.mock('~/modules/after-sales/after-sales-id.delete.service', () => ({
  default: mocks.remove,
}));
vi.mock('~/utils/api-logger', () => ({ logApiError: vi.fn() }));
vi.mock('~/utils/business-error', async (original) => ({
  ...(await original<typeof import('~/utils/business-error')>()),
  businessErrorResponse: vi.fn(() => ({ code: -1 })),
}));

describe('after-sales write authorization responses', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    ['edit', editHandler, mocks.edit],
    ['delete', deleteHandler, mocks.remove],
  ])(
    'preserves forbidden %s responses without invoking writes',
    async (_name, handler, upstream) => {
      const error = new BusinessError('FORBIDDEN', 'Denied', 403);
      vi.mocked(authorizeWrite).mockRejectedValueOnce(error);
      const event = {} as never;
      await expect(handler(event)).resolves.toEqual({ code: -1 });
      expect(businessErrorResponse).toHaveBeenCalledWith(event, error);
      expect(upstream).not.toHaveBeenCalled();
    },
  );
});
