import type { Prisma } from '@prisma/client';

import { BusinessError } from '~/utils/business-error';
import prisma from '~/utils/prisma';

type ReconciliationCutoff =
  | { createdAtCutoff: Date; kind: 'CREATED_AT' }
  | { idCutoff: string; kind: 'ID_BOUNDARY' }
  | { kind: 'SNAPSHOT_DESCRIPTOR'; snapshotDescriptor: Prisma.InputJsonValue };

function assertCutoff(cutoff: ReconciliationCutoff) {
  if (cutoff.kind === 'CREATED_AT' && !cutoff.createdAtCutoff) {
    throw new BusinessError(
      'RECONCILIATION_CUTOFF_REQUIRED',
      'Created-at cutoff is required',
      400,
    );
  }
  if (cutoff.kind === 'ID_BOUNDARY' && !String(cutoff.idCutoff || '').trim()) {
    throw new BusinessError(
      'RECONCILIATION_CUTOFF_REQUIRED',
      'ID cutoff is required',
      400,
    );
  }
}

export const IdentityReconciliationService = {
  async createRun(params: {
    baselineChecksum: string;
    consumerKey: string;
    cutoff: ReconciliationCutoff;
    factEntityType: string;
  }) {
    assertCutoff(params.cutoff);
    return prisma.identity_reconciliation_runs.create({
      data: {
        baselineChecksum: params.baselineChecksum.trim(),
        consumerKey: params.consumerKey.trim(),
        createdAtCutoff:
          params.cutoff.kind === 'CREATED_AT'
            ? params.cutoff.createdAtCutoff
            : null,
        cutoffKind: params.cutoff.kind,
        factEntityType: params.factEntityType.trim(),
        idCutoff:
          params.cutoff.kind === 'ID_BOUNDARY'
            ? params.cutoff.idCutoff.trim()
            : null,
        snapshotDescriptor:
          params.cutoff.kind === 'SNAPSHOT_DESCRIPTOR'
            ? params.cutoff.snapshotDescriptor
            : undefined,
      },
    });
  },
};
