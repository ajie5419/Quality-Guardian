import { submitInspectionRequest } from '@/api/inspection';
import { ErrorCode } from '@qgs/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createRequestSubmission } from './create-submission';

vi.mock('@/api/inspection', () => ({ submitInspectionRequest: vi.fn() }));

describe('request submission operation lifecycle', () => {
  beforeEach(() => vi.resetAllMocks());

  it('reuses the operation after a network failure and resets after success', async () => {
    const generate = vi
      .fn()
      .mockResolvedValueOnce('operation-1')
      .mockResolvedValueOnce('operation-2');
    const submit = createRequestSubmission(generate);
    const api = vi.mocked(submitInspectionRequest);
    api.mockRejectedValueOnce(new Error('timeout'));
    api.mockResolvedValue({ code: 0, data: {}, error: null, message: '' });
    await expect(submit({ quantity: 1 })).rejects.toThrow('timeout');
    await submit({ quantity: 1 });
    await submit({ quantity: 2 });
    expect(api.mock.calls.map((call) => call[1])).toEqual([
      'operation-1',
      'operation-1',
      'operation-2',
    ]);
  });

  it('retains in-progress keys and resets only after a reused-key conflict', async () => {
    const generate = vi
      .fn()
      .mockResolvedValueOnce('operation-1')
      .mockResolvedValueOnce('operation-2');
    const submit = createRequestSubmission(generate);
    const api = vi.mocked(submitInspectionRequest);
    api.mockResolvedValueOnce({
      code: -1,
      data: {},
      error: { code: ErrorCode.IDEMPOTENCY_REQUEST_IN_PROGRESS },
      message: '',
    });
    api.mockResolvedValueOnce({
      code: -1,
      data: {},
      error: { code: ErrorCode.IDEMPOTENCY_KEY_REUSED },
      message: '',
    });
    api.mockResolvedValueOnce({ code: 0, data: {}, error: null, message: '' });
    await submit({ quantity: 1 });
    await submit({ quantity: 2 });
    await submit({ quantity: 2 });
    expect(api.mock.calls.map((call) => call[1])).toEqual([
      'operation-1',
      'operation-1',
      'operation-2',
    ]);
  });

  it('uses native random bytes for the default operation key', async () => {
    vi.stubGlobal('wx', {
      getRandomValues: ({ success }: any) =>
        success({ randomValues: new Uint8Array(16).fill(171).buffer }),
    });
    vi.mocked(submitInspectionRequest).mockResolvedValue({
      code: 0,
      data: {},
      error: null,
      message: '',
    });
    try {
      await createRequestSubmission()({ quantity: 1 });
      expect(submitInspectionRequest).toHaveBeenCalledWith(
        { quantity: 1 },
        'ab'.repeat(16),
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
