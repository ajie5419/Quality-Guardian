import type { Prisma } from '@prisma/client';

import { MetricRefreshQueue } from '~/modules/metric-refresh';
import { BusinessError } from '~/utils/business-error';
import { createModuleLogger } from '~/utils/logger';
import { isPrismaUniqueConstraintError } from '~/utils/prisma-error';

const logger = createModuleLogger('TeamIdentityMergeSupplier');

interface SupplierMergeContext {
  sourceTeamId: string;
  targetName: string;
  targetTeamId: string;
}

type SupplierIdentityLinkRow = {
  id: string;
  identityId: string;
  isDeleted: boolean;
  supplierId: string;
};

function supplierLinkConflict() {
  return new BusinessError(
    'TEAM_MERGE_SUPPLIER_CONFLICT',
    'TEAM supplier links conflict',
    409,
  );
}

async function consolidateSupplierLinks(
  tx: Prisma.TransactionClient,
  merge: SupplierMergeContext,
  source: SupplierIdentityLinkRow,
  target: SupplierIdentityLinkRow,
) {
  if (source.isDeleted) return 0;
  if (!target.isDeleted && source.supplierId !== target.supplierId) {
    throw supplierLinkConflict();
  }
  await tx.supplier_identity_links.update({
    where: { id: source.id },
    data: { isDeleted: true },
  });
  await tx.supplier_identity_links.update({
    where: { id: target.id },
    data: {
      identityNameSnapshot: merge.targetName,
      isDeleted: false,
      supplierId: source.supplierId,
    },
  });
  await MetricRefreshQueue.enqueueSupplierScores(
    tx,
    [source.supplierId, target.supplierId],
    'team-identity.merged',
  );
  return 1;
}

async function loadSupplierLinks(
  tx: Prisma.TransactionClient,
  merge: SupplierMergeContext,
) {
  return tx.supplier_identity_links.findMany({
    where: {
      identityId: { in: [merge.sourceTeamId, merge.targetTeamId] },
      identityType: 'TEAM',
    },
  });
}

export async function migrateSupplierLinks(
  tx: Prisma.TransactionClient,
  merge: SupplierMergeContext,
) {
  const links = await loadSupplierLinks(tx, merge);
  const source = links.find((link) => link.identityId === merge.sourceTeamId);
  const target = links.find((link) => link.identityId === merge.targetTeamId);
  if (!source || source.isDeleted) {
    if (target && !target.isDeleted) {
      await MetricRefreshQueue.enqueueSupplierScores(
        tx,
        [target.supplierId],
        'team-identity.merged',
      );
    }
    return 0;
  }
  if (target) return consolidateSupplierLinks(tx, merge, source, target);

  try {
    await tx.supplier_identity_links.update({
      where: { id: source.id },
      data: {
        identityId: merge.targetTeamId,
        identityNameSnapshot: merge.targetName,
      },
    });
    await MetricRefreshQueue.enqueueSupplierScores(
      tx,
      [source.supplierId],
      'team-identity.merged',
    );
    return 1;
  } catch (error: unknown) {
    logger.error(
      { err: error, sourceTeamId: merge.sourceTeamId },
      'TEAM supplier link move conflicted',
    );
    if (!isPrismaUniqueConstraintError(error)) throw error;
  }

  const concurrentLinks = await loadSupplierLinks(tx, merge);
  const concurrentSource = concurrentLinks.find(
    (link) => link.identityId === merge.sourceTeamId,
  );
  const concurrentTarget = concurrentLinks.find(
    (link) => link.identityId === merge.targetTeamId,
  );
  if (!concurrentSource || !concurrentTarget) throw supplierLinkConflict();
  return consolidateSupplierLinks(
    tx,
    merge,
    concurrentSource,
    concurrentTarget,
  );
}
