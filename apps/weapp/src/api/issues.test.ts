import type { InspectionIssuePayload } from './issues';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createInspectionIssue } from './issues';
import { request } from './request';

vi.mock('./request', () => ({ request: vi.fn() }));

describe('inspection issue create API', () => {
  beforeEach(() => vi.clearAllMocks());

  it('passes the form operation key in the create request header', async () => {
    const data: InspectionIssuePayload = {
      photos: [],
      responsibilityType: 'INTERNAL_DEPARTMENT',
      responsibleDepartmentId: 'dept-1',
    };
    const operationId = 'abababababababababababababababab';
    await createInspectionIssue(data, operationId);
    expect(request).toHaveBeenCalledWith({
      data,
      header: { 'Idempotency-Key': operationId },
      method: 'POST',
      url: '/api/qms/inspection/issues',
    });
  });
});
