import { SupplierIdentityService } from '~/modules/supplier-identity';
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

async function refresh(params: { supplierIds?: string[] }) {
  const supplierIds = params.supplierIds || [];
  if (supplierIds.length === 0) return;
  try {
    // Dynamic import keeps supplier-event-listener.ts free of the
    // supplier-score-snapshot ↔ inspection circular dependency at module
    // load time; the listener fires asynchronously after the bus dispatches.
    const { SupplierScoreSnapshotService } = await import(
      './supplier-score-snapshot.service'
    );
    if (supplierIds.length > 0) {
      await SupplierScoreSnapshotService.refreshBySupplierIds(supplierIds);
    }
  } catch (error) {
    logger.warn(
      {
        err: error,
        supplierIdCount: supplierIds.length,
      },
      'supplier score refresh from event listener failed',
    );
  }
}

async function resolveTeamSupplierIds(teamIds: string[]) {
  const suppliers = await Promise.all(
    teamIds.map((teamId) =>
      SupplierIdentityService.resolveSupplierByTeamId(teamId),
    ),
  );
  return uniqueNonEmpty(suppliers.map((supplier) => supplier?.id));
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
    await refresh({
      supplierIds: uniqueNonEmpty(payload.supplierIds),
    });
  });

  eventBus.on('inspection_issue.changed', async (payload) => {
    await refresh({
      supplierIds: uniqueNonEmpty(payload.supplierIds),
    });
  });

  eventBus.on('inspection_record.changed', async (payload) => {
    const teamSupplierIds = await resolveTeamSupplierIds(
      uniqueNonEmpty(payload.teamIds),
    );
    await refresh({
      supplierIds: uniqueNonEmpty([...payload.supplierIds, ...teamSupplierIds]),
    });
  });
}
