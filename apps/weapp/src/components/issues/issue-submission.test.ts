import type { InspectionIssuePayload } from '@/api/issues';

import { createInspectionIssue } from '@/api/issues';
import { ErrorCode } from '@qgs/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createIssueSubmission } from './issue-submission';

vi.mock('@/api/issues', () => ({ createInspectionIssue: vi.fn() }));

const payload: InspectionIssuePayload = {
  photos: [],
  quantity: 1,
  responsibilityType: 'INTERNAL_DEPARTMENT',
  responsibleDepartmentId: 'dept-1',
};

describe('issue submission operation lifecycle', () => {
  beforeEach(() => vi.resetAllMocks());

  it('reuses the operation after a network failure and resets after success', async () => {
    const generate = vi
      .fn()
      .mockResolvedValueOnce('operation-1')
      .mockResolvedValueOnce('operation-2');
    const submit = createIssueSubmission(generate);
    const api = vi.mocked(createInspectionIssue);
    api.mockRejectedValueOnce(new Error('timeout'));
    api.mockResolvedValue({ code: 0, data: {}, error: null, message: '' });
    await expect(submit(payload)).rejects.toThrow('timeout');
    await submit(payload);
    await submit({ ...payload, quantity: 2 });
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
    const submit = createIssueSubmission(generate);
    const api = vi.mocked(createInspectionIssue);
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
    await submit(payload);
    await submit({ ...payload, quantity: 2 });
    await submit({ ...payload, quantity: 2 });
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
    vi.mocked(createInspectionIssue).mockResolvedValue({
      code: 0,
      data: {},
      error: null,
      message: '',
    });
    try {
      await createIssueSubmission()(payload);
      expect(createInspectionIssue).toHaveBeenCalledWith(
        payload,
        'ab'.repeat(16),
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
