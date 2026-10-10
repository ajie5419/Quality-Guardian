import { beforeEach, describe, expect, it, vi } from 'vitest';
import upstreamHandler from '~/modules/quality-loss/quality-loss-create.post.service';
import { authorizeWrite } from '~/modules/rbac';
import { BusinessError, businessErrorResponse } from '~/utils/business-error';

import handler from './index.post';

vi.mock('h3', () => ({ defineEventHandler: (fn: unknown) => fn }));
vi.mock('~/modules/rbac', () => ({
  authorizeWrite: vi.fn(),
}));
vi.mock('~/modules/quality-loss/quality-loss-create.post.service', () => ({
  default: vi.fn(),
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

describe('quality-loss post authorization boundary', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns a standard 403 response when create authorization fails', async () => {
    const error = new BusinessError('FORBIDDEN', 'Denied', 403);
    vi.mocked(authorizeWrite).mockRejectedValueOnce(error);
    const event = {} as never;
    const result = await handler(event as never);
    expect(result).toEqual({ code: -1, status: 403 });
    expect(businessErrorResponse).toHaveBeenCalledWith(event, error);
    expect(upstreamHandler).not.toHaveBeenCalled();
  });

  it('delegates to upstream handler when authorization succeeds', async () => {
    vi.mocked(authorizeWrite).mockResolvedValueOnce({ id: 'user-1' } as never);
    vi.mocked(upstreamHandler).mockResolvedValueOnce({
      code: 0,
      data: { id: 'ql-1' },
    } as never);
    const event = {} as never;
    const result = await handler(event);
    expect(result).toEqual({ code: 0, data: { id: 'ql-1' } });
    expect(upstreamHandler).toHaveBeenCalledWith(event);
  });
});
