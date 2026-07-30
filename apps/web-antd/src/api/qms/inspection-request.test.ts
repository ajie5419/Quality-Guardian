import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  approveInspectionMaterialRequest,
  getInspectionMaterialRequests,
  getPublicInspectionRequestPartOptions,
  rejectInspectionMaterialRequest,
} from './inspection-request';

const { publicGet, requestGet, requestPost } = vi.hoisted(() => ({
  publicGet: vi.fn(),
  requestGet: vi.fn(),
  requestPost: vi.fn(),
}));

vi.mock('#/api/request', () => ({
  publicRequestClient: { get: publicGet },
  requestClient: {
    get: requestGet,
    post: requestPost,
  },
}));

describe('inspection material request api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('searches canonical part options through the public endpoint', async () => {
    publicGet.mockResolvedValue([{ id: 'part-1', name: 'Frame' }]);

    await expect(
      getPublicInspectionRequestPartOptions({ keyword: 'Frame' }),
    ).resolves.toEqual([{ id: 'part-1', name: 'Frame' }]);
    expect(publicGet).toHaveBeenCalledWith(
      '/qms/public/inspection/requests/part-options',
      { params: { keyword: 'Frame' } },
    );
  });

  it('normalizes the material request list', async () => {
    requestGet.mockResolvedValue({
      items: [{ id: 'material-request-1' }],
      total: 1,
    });

    await expect(
      getInspectionMaterialRequests({
        page: 1,
        pageSize: 20,
        status: 'PENDING',
      }),
    ).resolves.toEqual({
      items: [{ id: 'material-request-1' }],
      total: 1,
    });
    expect(requestGet).toHaveBeenCalledWith(
      '/qms/inspection/material-requests',
      { params: { page: 1, pageSize: 20, status: 'PENDING' } },
    );
  });

  it('uses the agreed approval and rejection payloads', async () => {
    requestPost.mockResolvedValue({ id: 'material-request-1' });

    await approveInspectionMaterialRequest('material-request-1', {
      mode: 'LINK_EXISTING',
      partId: 'part-1',
      remark: 'Same material',
    });
    await rejectInspectionMaterialRequest('material-request-1', {
      remark: 'Invalid request',
    });

    expect(requestPost).toHaveBeenNthCalledWith(
      1,
      '/qms/inspection/material-requests/material-request-1/approve',
      {
        mode: 'LINK_EXISTING',
        partId: 'part-1',
        remark: 'Same material',
      },
    );
    expect(requestPost).toHaveBeenNthCalledWith(
      2,
      '/qms/inspection/material-requests/material-request-1/reject',
      { remark: 'Invalid request' },
    );
  });
});
