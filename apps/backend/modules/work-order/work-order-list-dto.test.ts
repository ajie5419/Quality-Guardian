import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkOrderRequirementService } from '~/modules/work-order-requirement';
import { mapWorkOrderItems } from '~/modules/work-order/work-order-list-dto';

vi.mock('~/utils/prisma', () => ({
  default: {
    work_orders: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
    work_order_requirements: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock('~/modules/work-order-requirement', () => ({
  WorkOrderRequirementService: {
    getSummaryByWorkOrderNumbers: vi.fn(),
  },
}));

describe('mapWorkOrderItems', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (
      WorkOrderRequirementService.getSummaryByWorkOrderNumbers as any
    ).mockResolvedValue(new Map());
  });

  /**
   * OPTIMISTIC-LOCK-001 regression: the interactive list must carry the
   * version token. Dropping it made every UI edit fail with 400 because the
   * editor echoed back `undefined`.
   */
  it('passes the optimistic-lock version through to the list item', async () => {
    const [item] = await mapWorkOrderItems([
      {
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        customerName: 'E2E Customer',
        deliveryDate: new Date('2030-01-01T00:00:00.000Z'),
        division: 'E2E Production',
        effectiveTime: null,
        multiStationEnabled: false,
        projectName: 'E2E Project',
        quantity: 7,
        status: 'OPEN',
        version: 3,
        workOrderNumber: 'WO-VERSION',
      },
    ]);

    expect(item.version).toBe(3);
    expect(item.id).toBe('WO-VERSION');
  });

  it('keeps the version of a stale read distinguishable from a fresh one', async () => {
    const items = await mapWorkOrderItems(
      [1, 2].map((version) => ({
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        customerName: 'E2E Customer',
        deliveryDate: new Date('2030-01-01T00:00:00.000Z'),
        division: null,
        effectiveTime: null,
        multiStationEnabled: false,
        projectName: 'E2E Project',
        quantity: 1,
        status: 'OPEN',
        version,
        workOrderNumber: `WO-${version}`,
      })),
    );

    expect(items.map((row) => row.version)).toEqual([1, 2]);
  });
});
