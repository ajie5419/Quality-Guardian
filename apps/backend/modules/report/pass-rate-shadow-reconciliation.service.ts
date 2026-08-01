import type { Prisma } from '@prisma/client';

import { IdentityReconciliationService } from '~/modules/master-data-identity';
import { BusinessError } from '~/utils/business-error';
import { createModuleLogger } from '~/utils/logger';
import prisma from '~/utils/prisma';

import {
  createPassRateTargetResolver,
  getLegacyInspectionPassRateSummaryByRange,
  getLegacyPassRateDrillDownByRange,
} from './pass-rate';
import {
  capturePassRateProjectionSnapshot,
  getProjectedPassRateDrillDownByRange,
  getProjectedPassRateSummaryByRange,
} from './pass-rate-projection-query.service';

const logger = createModuleLogger('PassRateShadowReconciliation');

function numberMetric(
  metricKey: string,
  legacyValue: number,
  projectionValue: number,
  details?: Prisma.InputJsonObject,
) {
  return {
    details,
    differenceValue: projectionValue - legacyValue,
    legacyValue,
    metricKey,
    projectionValue,
  };
}

/**
 * Reconciliation pins both implementations to the same fact boundary. Business
 * dates only select rows inside that boundary, so later backfilled records do
 * not become false identity differences.
 */
export const PassRateShadowReconciliationService = {
  async run(params: { baselineChecksum: string; end: Date; start: Date }) {
    const active =
      await prisma.identity_projection_generation_pointer.findUnique({
        where: { key: 'historical-identity' },
        select: { activeGenerationId: true },
      });
    if (!active?.activeGenerationId) {
      throw new BusinessError(
        'PASS_RATE_PROJECTION_UNAVAILABLE',
        'Pass-rate identity projection has not been published',
        409,
      );
    }
    const snapshot = await capturePassRateProjectionSnapshot(
      active.activeGenerationId,
    );
    const run = await IdentityReconciliationService.createRun({
      baselineChecksum: params.baselineChecksum,
      consumerKey: 'pass-rate',
      cutoff: {
        kind: 'SNAPSHOT_DESCRIPTOR',
        snapshotDescriptor: {
          createdAtCutoff: snapshot.createdAtCutoff.toISOString(),
          idCutoff: snapshot.idCutoff,
        },
      },
      factEntityType: 'inspections',
      projectionGenerationId: active.activeGenerationId,
    });
    try {
      const targetResolver = await createPassRateTargetResolver();
      const [legacy, projected, legacyDrillDown, projectedDrillDown, states] =
        await Promise.all([
          getLegacyInspectionPassRateSummaryByRange(
            params.start,
            params.end,
            snapshot,
          ),
          getProjectedPassRateSummaryByRange(
            active.activeGenerationId,
            params.start,
            params.end,
            snapshot,
          ),
          getLegacyPassRateDrillDownByRange(
            params.start,
            params.end,
            targetResolver,
            'inspection',
            snapshot,
          ),
          getProjectedPassRateDrillDownByRange(
            active.activeGenerationId,
            params.start,
            params.end,
            snapshot,
            targetResolver,
          ),
          prisma.pass_rate_process_identity_projection.groupBy({
            by: ['state'],
            where: {
              generationId: active.activeGenerationId,
              inspectionDate: { gte: params.start, lte: params.end },
              OR: [
                { createdAtSnapshot: { lt: snapshot.createdAtCutoff } },
                {
                  createdAtSnapshot: snapshot.createdAtCutoff,
                  inspectionId: { lte: snapshot.idCutoff },
                },
              ],
            },
            _count: { _all: true },
          }),
        ]);
      const metrics = [
        numberMetric('TOTAL_COUNT', legacy.totalCount, projected.totalCount),
        numberMetric('PASS_COUNT', legacy.passCount, projected.passCount),
        numberMetric('PASS_RATE', legacy.passRate, projected.passRate),
        numberMetric(
          'DRILL_DOWN_BUCKET_COUNT',
          legacyDrillDown.length,
          projectedDrillDown.length,
          {
            legacy: legacyDrillDown.map((item) => ({
              category: item.category,
              displayName: item.process,
              totalCount: item.totalCount,
            })),
            projection: projectedDrillDown.map((item) => ({
              category: item.category,
              displayName: item.process,
              processId: item.processId,
              state: item.state,
              totalCount: item.totalCount,
            })),
          },
        ),
        ...states.map((item) =>
          numberMetric(`IDENTITY_STATE:${item.state}`, 0, item._count._all),
        ),
      ];
      await IdentityReconciliationService.completeRun({
        metrics,
        runId: run.id,
      });
      return {
        generationId: active.activeGenerationId,
        legacy,
        projected,
        runId: run.id,
        snapshot,
        stateCounts: states,
      };
    } catch (error: unknown) {
      logger.error(error, 'Pass-rate shadow reconciliation failed');
      await prisma.identity_reconciliation_runs.update({
        where: { id: run.id },
        data: {
          completedAt: new Date(),
          failureReason:
            error instanceof Error ? error.message : 'Unknown error',
          status: 'FAILED',
        },
      });
      throw error;
    }
  },
};
