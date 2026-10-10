import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authorizeWrite } from '~/modules/rbac';
import { BusinessError, businessErrorResponse } from '~/utils/business-error';

vi.mock('~/utils/prisma', () => ({ default: {} }));
vi.mock('~/modules/rbac', () => ({ authorizeWrite: vi.fn() }));
vi.mock('~/utils/api-logger', () => ({ logApiError: vi.fn() }));
vi.mock('~/utils/business-error', async (original) => ({
  ...(await original<typeof import('~/utils/business-error')>()),
  businessErrorResponse: vi.fn(() => ({ code: -1 })),
}));

describe('supervision write authorization error boundary', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    './index.post',
    './[id].put',
    './[id].delete',
    './[id]/plan-tasks/index.post',
    './[id]/plan-tasks/[taskId].put',
    './[id]/plan-tasks/[taskId].delete',
    './[id]/plan-tasks/reorder.put',
    './[id]/plan-tasks/import/index.post',
    '../issues/index.post',
    '../issues/[id].put',
    '../issues/[id].delete',
    '../issues/[id]/actions/index.post',
    '../reports/index.post',
    '../reports/index.put',
    '../reports/index.delete',
  ])('preserves forbidden responses in %s', async (path) => {
    const { default: handler } = await import(path);
    const error = new BusinessError('FORBIDDEN', 'Denied', 403);
    vi.mocked(authorizeWrite).mockRejectedValueOnce(error);
    const event = {} as never;
    await expect(handler(event)).resolves.toEqual({ code: -1 });
    expect(businessErrorResponse).toHaveBeenCalledWith(event, error);
    expect(authorizeWrite).toHaveBeenCalledTimes(1);
  });
});
