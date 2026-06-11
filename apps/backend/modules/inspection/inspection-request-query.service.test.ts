import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '~/utils/prisma';

import { InspectionRequestQueryService } from './inspection-request-query.service';

vi.mock('~/utils/prisma', () => ({
  default: {
    qms_inspection_requests: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
    quality_records: {
      findMany: vi.fn(),
    },
  },
}));

describe('inspection request query service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('falls back to legacy request list query when work order link table is not migrated', async () => {
    vi.mocked(prisma.qms_inspection_requests.findMany)
      .mockRejectedValueOnce({ code: 'P2021' })
      .mockResolvedValueOnce([
        {
          attachments: null,
          closeAttachments: null,
          dispatcher: null,
          inspection: null,
          inspectionId: null,
          inspector: null,
          linkedIssueId: null,
          process: null,
          requestNo: 'IR-1',
          workOrderNumber: 'WO-001',
        },
      ] as any);
    vi.mocked(prisma.qms_inspection_requests.count).mockResolvedValue(1);
    vi.mocked(prisma.quality_records.findMany).mockResolvedValue([]);

    const result = await InspectionRequestQueryService.getRequestList(
      { id: 'user-1' } as any,
      { current: 'true' },
    );

    expect(result.total).toBe(1);
    expect(result.items[0]?.workOrderNumbers).toEqual(['WO-001']);
    expect(prisma.qms_inspection_requests.findMany).toHaveBeenCalledTimes(2);
  });
});
