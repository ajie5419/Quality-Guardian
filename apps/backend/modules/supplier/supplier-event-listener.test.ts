import { describe, expect, it, vi } from 'vitest';
import { eventBus } from '~/utils/event-bus';

import { registerSupplierEventListeners } from './supplier-event-listener';

const handlers = vi.hoisted(
  () =>
    new Map<
      string,
      (payload: {
        supplierNames: Array<null | string | undefined>;
        teamNames: Array<null | string | undefined>;
      }) => Promise<void>
    >(),
);
const refreshBySupplierNames = vi.hoisted(() => vi.fn());

vi.mock('~/utils/event-bus', () => ({
  eventBus: {
    on: vi.fn((event: string, handler: never) => {
      handlers.set(event, handler);
    }),
  },
}));

vi.mock('./supplier-score-snapshot.service', () => ({
  SupplierScoreSnapshotService: {
    refreshBySupplierNames,
  },
}));

describe('supplierEventListener', () => {
  it('refreshes unique supplier and team names after an inspection changes', async () => {
    registerSupplierEventListeners();
    const handler = handlers.get('inspection_record.changed');

    expect(eventBus.on).toHaveBeenCalledWith(
      'inspection_record.changed',
      expect.any(Function),
    );
    expect(handler).toBeDefined();
    await handler?.({
      supplierNames: ['Supplier A', 'Shared Partner', null],
      teamNames: ['Outsourcing A', 'Shared Partner', ''],
    });

    expect(refreshBySupplierNames).toHaveBeenCalledWith([
      'Supplier A',
      'Shared Partner',
      'Outsourcing A',
    ]);
  });
});
