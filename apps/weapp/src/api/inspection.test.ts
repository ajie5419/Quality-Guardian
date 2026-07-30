import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getPartOptions } from './inspection';

const { requestMock } = vi.hoisted(() => ({
  requestMock: vi.fn(),
}));

vi.mock('./request', () => ({
  request: requestMock,
}));

describe('inspection material option api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('searches active canonical materials through the public endpoint', async () => {
    requestMock.mockResolvedValue({
      code: 0,
      data: [{ id: 'part-1', name: 'Frame' }],
    });

    await getPartOptions('Frame');

    expect(requestMock).toHaveBeenCalledWith({
      data: { keyword: 'Frame' },
      method: 'GET',
      url: '/api/qms/public/inspection/requests/part-options',
    });
  });
});
