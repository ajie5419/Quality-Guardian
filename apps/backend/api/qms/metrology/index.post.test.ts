import { beforeEach, expect, it, vi } from 'vitest';
import { authorizeWrite } from '~/modules/rbac';
import { BusinessError, businessErrorResponse } from '~/utils/business-error';

import handler from './index.post';

const upstream = vi.hoisted(() => vi.fn());
vi.mock('~/modules/rbac', () => ({ authorizeWrite: vi.fn() }));
vi.mock('~/modules/metrology/metrology-create.post.service', () => ({
  default: upstream,
}));
vi.mock('~/utils/api-logger', () => ({ logApiError: vi.fn() }));
vi.mock('~/utils/business-error', async (original) => ({
  ...(await original<typeof import('~/utils/business-error')>()),
  businessErrorResponse: vi.fn(() => ({ code: 'FORBIDDEN' })),
}));
beforeEach(() => vi.clearAllMocks());

it('converts denied authorization to a business response without executing a write', async () => {
  const error = new BusinessError('FORBIDDEN', 'Denied', 403);
  vi.mocked(authorizeWrite).mockRejectedValueOnce(error);
  const event = {} as never;
  await expect(handler(event)).resolves.toEqual({ code: 'FORBIDDEN' });
  expect(businessErrorResponse).toHaveBeenCalledWith(event, error);
  expect(upstream).not.toHaveBeenCalled();
});
