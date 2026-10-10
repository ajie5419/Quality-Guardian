import { beforeEach, describe, expect, it, vi } from 'vitest';
import inspectionRecordUpdateHandler from '~/modules/inspection/inspection-record-id.put.service';
import { authorizeWrite } from '~/modules/rbac';
import { BusinessError, businessErrorResponse } from '~/utils/business-error';

import handler from './[id].put';

vi.mock('h3', () => ({ defineEventHandler: (fn: unknown) => fn }));
vi.mock('~/modules/rbac', () => ({ authorizeWrite: vi.fn() }));
vi.mock('~/modules/inspection/inspection-record-id.put.service', () => ({
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

const event = { context: {} } as never;

describe('inspection record put authorization boundary', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns a standard 403 response when edit authorization fails', async () => {
    const error = new BusinessError('FORBIDDEN', 'Denied', 403);
    vi.mocked(authorizeWrite).mockRejectedValueOnce(error);

    expect(await handler(event)).toEqual({ code: -1, status: 403 });
    expect(businessErrorResponse).toHaveBeenCalledWith(event, error);
    expect(inspectionRecordUpdateHandler).not.toHaveBeenCalled();
  });

  it('delegates to the business handler once authorized', async () => {
    vi.mocked(authorizeWrite).mockResolvedValueOnce({ id: 'user-1' } as never);
    vi.mocked(inspectionRecordUpdateHandler).mockResolvedValueOnce({
      ok: true,
    } as never);

    expect(await handler(event)).toEqual({ ok: true });
    expect(inspectionRecordUpdateHandler).toHaveBeenCalledWith(event);
  });
});
