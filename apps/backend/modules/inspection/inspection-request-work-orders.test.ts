import { describe, expect, it, vi } from 'vitest';

import { assertWorkOrdersExist } from './inspection-request-work-orders';

describe('inspection request work-order existence', () => {
  it('returns a client business error for missing orders before any write', async () => {
    const findMany = vi
      .fn()
      .mockResolvedValue([
        { workOrderNumber: 'WO-1', quantity: 3, multiStationEnabled: true },
      ]);
    await expect(
      assertWorkOrdersExist({ work_orders: { findMany } } as any, [
        'WO-1',
        'MISSING',
      ]),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      httpStatus: 400,
      message: '工单不存在：MISSING',
    });
    expect(findMany).toHaveBeenCalledTimes(1);
  });

  it('retains deduplicated lookup and the station policy for valid orders', async () => {
    const rows = [
      { workOrderNumber: 'WO-1', quantity: 3, multiStationEnabled: true },
    ];
    const findMany = vi.fn().mockResolvedValue(rows);
    expect(
      await assertWorkOrdersExist({ work_orders: { findMany } } as any, [
        ' WO-1 ',
        'WO-1',
      ]),
    ).toEqual(rows);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workOrderNumber: { in: ['WO-1'] } },
        select: expect.objectContaining({ multiStationEnabled: true }),
      }),
    );
  });
});
