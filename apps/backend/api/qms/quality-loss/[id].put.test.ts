import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QualityLossService } from '~/modules/quality-loss/quality-loss.service';
import { authorizeWrite } from '~/modules/rbac';
import { BusinessError, businessErrorResponse } from '~/utils/business-error';

import handler from './[id].put';

vi.mock('h3', () => ({
  defineEventHandler: (fn: unknown) => fn,
  readBody: vi.fn().mockResolvedValue({ amount: 100 }),
}));
vi.mock('~/modules/rbac', () => ({ authorizeWrite: vi.fn() }));
vi.mock('~/modules/quality-loss/quality-loss.service', () => ({
  QualityLossService: { updateByRouteId: vi.fn() },
}));
vi.mock('~/utils/current-user', () => ({
  getCurrentUser: vi.fn().mockReturnValue({ id: 'user-1', username: 'tester' }),
}));
vi.mock('~/utils/route-param', () => ({
  getRequiredRouterParam: vi.fn().mockReturnValue('ql-1'),
}));
vi.mock('~/utils/api-logger', () => ({ logApiError: vi.fn() }));
vi.mock('~/utils/business-error', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('~/utils/business-error')>();
  return {
    ...actual,
    businessErrorResponse: vi.fn(() => ({ code: -1, status: 403 })),
  };
});

describe('quality-loss put authorization boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a standard 403 response when edit authorization fails', async () => {
    const error = new BusinessError('FORBIDDEN', 'Denied', 403);
    vi.mocked(authorizeWrite).mockRejectedValueOnce(error);
    const event = { context: {} } as never;
    const result = await handler(event);
    expect(result).toEqual({ code: -1, status: 403 });
    expect(businessErrorResponse).toHaveBeenCalledWith(event, error);
    expect(QualityLossService.updateByRouteId).not.toHaveBeenCalled();
  });
});
