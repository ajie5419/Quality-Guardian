import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getInspectionRequestResponsibilityOptions,
  getPartOptions,
  submitInspectionRequest,
} from './inspection';

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

  it('sends the operation key to the authenticated create endpoint', async () => {
    await submitInspectionRequest({ workOrderNumber: 'WO-1' }, 'operation-001');
    expect(requestMock).toHaveBeenCalledWith({
      data: { workOrderNumber: 'WO-1' },
      header: { 'Idempotency-Key': 'operation-001' },
      method: 'POST',
      url: '/api/qms/inspection/requests/v2',
    });
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

  it('loads request responsibility options through the authenticated endpoint', async () => {
    requestMock.mockResolvedValue({
      code: 0,
      data: { departments: [], suppliers: [] },
    });

    await getInspectionRequestResponsibilityOptions({
      responsibilityType: 'INTERNAL_DEPARTMENT',
    });

    expect(requestMock).toHaveBeenCalledWith({
      data: { responsibilityType: 'INTERNAL_DEPARTMENT' },
      method: 'GET',
      url: '/api/qms/inspection/requests/responsibility-options',
    });
  });
});
