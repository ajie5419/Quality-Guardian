import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '~/utils/prisma';

import { remediateConfirmedInspectionIdentityRows } from './remediate-confirmed-inspection-identity-rows';

vi.mock('~/utils/prisma', () => ({
  default: {
    inspections: { updateMany: vi.fn() },
  },
}));

vi.mock('~/utils/logger', () => ({
  createModuleLogger: vi
    .fn()
    .mockReturnValue({ fatal: vi.fn(), info: vi.fn() }),
}));

describe('remediateConfirmedInspectionIdentityRows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.inspections.updateMany).mockResolvedValue({ count: 1 });
  });

  it('updates the conflicting supplier to the confirmed TEAM supplier', async () => {
    await remediateConfirmedInspectionIdentityRows({ mode: 'apply' });

    expect(prisma.inspections.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'cmlapxxvx0015pe01vtrxh0f3',
          supplierId: 'SUP-1769076084955-rlsb',
          teamId: '0e9b4241568311f1881c00163e37355f',
          workOrderNumber: '25TL-CL-2645',
        }),
        data: {
          supplierId: 'SUP-1769076104309-6h4o',
          supplierName: '秦皇岛中通机械制造有限公司',
        },
      }),
    );
  });

  it('soft deletes the two confirmed legacy rows', async () => {
    await remediateConfirmedInspectionIdentityRows({ mode: 'apply' });

    const deleteCalls = vi
      .mocked(prisma.inspections.updateMany)
      .mock.calls.filter(
        (call) =>
          (call[0] as { data?: { isDeleted?: boolean } }).data?.isDeleted ===
          true,
      );
    expect(deleteCalls).toHaveLength(2);
  });

  it('does not write in dry-run mode', async () => {
    await remediateConfirmedInspectionIdentityRows({ mode: 'dry-run' });
    expect(prisma.inspections.updateMany).not.toHaveBeenCalled();
  });
});
