import { eventBus } from '~/utils/event-bus';
import { createModuleLogger } from '~/utils/logger';

const logger = createModuleLogger('supplier-event-listener');

let registered = false;

function uniqueNonEmpty(values: Array<null | string | undefined>): string[] {
  const set = new Set<string>();
  for (const value of values) {
    const trimmed = String(value || '').trim();
    if (trimmed) set.add(trimmed);
  }
  return [...set];
}

async function refresh(supplierNames: string[]) {
  if (supplierNames.length === 0) return;
  try {
    // Dynamic import keeps supplier-event-listener.ts free of the
    // supplier-score-snapshot ↔ inspection circular dependency at module
    // load time; the listener fires asynchronously after the bus dispatches.
    const { SupplierScoreSnapshotService } = await import(
      './supplier-score-snapshot.service'
    );
    await SupplierScoreSnapshotService.refreshBySupplierNames(supplierNames);
  } catch (error) {
    logger.warn(
      { err: error, count: supplierNames.length },
      'supplier score refresh from event listener failed',
    );
  }
}

/**
 * Subscribe once to domain events that should rebuild supplier score
 * snapshots. Idempotent — safe to call multiple times during module
 * loading.
 */
export function registerSupplierEventListeners(): void {
  if (registered) return;
  registered = true;

  eventBus.on('after_sales.changed', async (payload) => {
    await refresh(uniqueNonEmpty(payload.supplierBrands));
  });

  eventBus.on('inspection_issue.changed', async (payload) => {
    await refresh(uniqueNonEmpty(payload.supplierNames));
  });
}
