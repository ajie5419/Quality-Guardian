import type { Prisma } from '@prisma/client';

import { BusinessError } from '~/utils/business-error';
import prisma from '~/utils/prisma';

type ReconciliationCutoff =
  | { createdAtCutoff: Date; kind: 'CREATED_AT' }
  | { idCutoff: string; kind: 'ID_BOUNDARY' }
  | { kind: 'SNAPSHOT_DESCRIPTOR'; snapshotDescriptor: Prisma.InputJsonValue };

export type ReconciliationMetric = {
  details?: Prisma.InputJsonValue;
  differenceValue: number;
  legacyValue: number;
  metricKey: string;
  projectionValue: number;
};

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

  async completeRun(params: {
    metrics: ReconciliationMetric[];
    runId: string;
  }) {
    return prisma.$transaction(async (tx) => {
      const run = await tx.identity_reconciliation_runs.findUnique({
        where: { id: params.runId },
        select: { status: true },
      });
      if (!run || (run.status !== 'PENDING' && run.status !== 'RUNNING')) {
        throw new BusinessError(
          'RECONCILIATION_RUN_NOT_WRITABLE',
          'Reconciliation run is not writable',
          409,
        );
      }
      await tx.identity_reconciliation_metrics.createMany({
        data: params.metrics.map((metric) => ({
          details: metric.details,
          differenceValue: metric.differenceValue,
          legacyValue: metric.legacyValue,
          metricKey: metric.metricKey,
          projectionValue: metric.projectionValue,
          runId: params.runId,
        })),
      });
      return tx.identity_reconciliation_runs.update({
        where: { id: params.runId },
        data: { completedAt: new Date(), status: 'COMPLETED' },
      });
    });
  },
};
