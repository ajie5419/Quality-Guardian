import { describe, expect, it, vi } from 'vitest';
import { eventBus } from '~/utils/event-bus';

import { registerSupplierEventListeners } from './supplier-event-listener';

const handlers = vi.hoisted(
  () =>
    new Map<
      string,
      (payload: {
        supplierBrands?: Array<null | string | undefined>;
        supplierIds?: Array<null | string | undefined>;
        supplierNames?: Array<null | string | undefined>;
        teamIds?: Array<null | string | undefined>;
        teamNames?: Array<null | string | undefined>;
      }) => Promise<void>
    >(),
);
const refreshBySupplierNames = vi.hoisted(() => vi.fn());
const refreshBySupplierIds = vi.hoisted(() => vi.fn());
const resolveSupplierByTeamId = vi.hoisted(() => vi.fn());

vi.mock('~/utils/event-bus', () => ({
  eventBus: {
    on: vi.fn((event: string, handler: never) => {
      handlers.set(event, handler);
    }),
  },
}));

vi.mock('./supplier-score-snapshot.service', () => ({
  SupplierScoreSnapshotService: {
    refreshBySupplierIds,
    refreshBySupplierNames,
  },
}));

vi.mock('~/modules/supplier-identity', () => ({
  SupplierIdentityService: {
    resolveSupplierByTeamId,
  },
}));

describe('supplierEventListener', () => {
  it('refreshes supplier IDs including mapped TEAM identities', async () => {
    resolveSupplierByTeamId.mockResolvedValue({
      id: 'supplier-team-1',
      name: 'Outsourcing A',
    });
    registerSupplierEventListeners();
    const handler = handlers.get('inspection_record.changed');

    expect(eventBus.on).toHaveBeenCalledWith(
      'inspection_record.changed',
      expect.any(Function),
    );
    expect(handler).toBeDefined();
    await handler?.({
      supplierIds: ['supplier-1'],
      supplierNames: ['Supplier A', 'Shared Partner', null],
      teamIds: ['team-1'],
      teamNames: ['Outsourcing A', 'Shared Partner', ''],
    });

    expect(resolveSupplierByTeamId).toHaveBeenCalledWith('team-1');
    expect(refreshBySupplierIds).toHaveBeenCalledWith([
      'supplier-1',
      'supplier-team-1',
    ]);
    expect(refreshBySupplierNames).not.toHaveBeenCalled();
  });

  it('refreshes after-sales snapshots by canonical supplier ID', async () => {
    registerSupplierEventListeners();
    const handler = handlers.get('after_sales.changed');

    await handler?.({
      supplierBrands: ['Supplier A'],
      supplierIds: ['supplier-1'],
      teamNames: [],
    });

    expect(refreshBySupplierIds).toHaveBeenCalledWith(['supplier-1']);
    expect(refreshBySupplierNames).not.toHaveBeenCalled();
  });
});
