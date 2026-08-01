import process from 'node:process';

import {
  getCanonicalIdentityState,
  HistoricalIdentityResolutionService,
  IdentityProjectionService,
} from '~/modules/master-data-identity';
import { PassRateProjectionService } from '~/modules/report';
import { isBusinessError } from '~/utils/business-error';
import prisma from '~/utils/prisma';

type ResolutionState = 'INVALID_ID' | 'NOT_APPLICABLE' | 'RESOLVED' | 'RETIRED';

function parseOptions(args: string[]) {
  if (args.length !== 1 || args[0] !== '--apply') {
    throw new Error('APPLY_REQUIRED');
  }
}

export function getDeterministicUnresolvedClassification(params: {
  category: string;
  entityType: string;
  fieldName: string;
  rawIdState: null | ResolutionState;
}) {
  if (params.rawIdState) return params.rawIdState;
  if (
    params.entityType === 'inspections' &&
    params.fieldName === 'processId' &&
    params.category !== 'PROCESS'
  ) {
    return 'NOT_APPLICABLE' as const;
  }
  return null;
}

async function resolveRawId(params: {
  entityType: string;
  fieldName: string;
  rawId: null | string;
}): Promise<null | ResolutionState> {
  const rawId = String(params.rawId || '').trim();
  if (!rawId) return null;
  try {
    return await getCanonicalIdentityState(
      params.entityType,
      params.fieldName,
      rawId,
    );
  } catch (error: unknown) {
    if (isBusinessError(error) && error.code === 'INVALID_CANONICAL_ID') {
      return 'INVALID_ID';
    }
    throw error;
  }
}

/**
 * Classification intentionally changes only decisions. A blank reference is
 * not assumed to be irrelevant; only a non-process inspection's processId is
 * provably outside the process pass-rate domain.
 */
export async function classifyHistoricalIdentityUnresolved(
  args = process.argv.slice(2),
) {
  parseOptions(args);
  const generationId = await IdentityProjectionService.getActiveGenerationId();
  if (!generationId) throw new Error('ACTIVE_GENERATION_REQUIRED');
  let afterId: string | undefined;
  let invalidId = 0;
  let notApplicable = 0;
  let resolved = 0;
  let retired = 0;
  for (;;) {
    const rows = await prisma.identity_resolution_projection.findMany({
      where: {
        generationId,
        id: afterId ? { gt: afterId } : undefined,
        state: 'UNRESOLVED',
      },
      orderBy: { id: 'asc' },
      take: 200,
      select: {
        entityId: true,
        entityType: true,
        fieldName: true,
        id: true,
        resolutionId: true,
      },
    });
    if (rows.length === 0) break;
    const inspectionIds = rows
      .filter((row) => row.entityType === 'inspections')
      .map((row) => row.entityId);
    const [decisions, inspections] = await Promise.all([
      prisma.historical_identity_resolutions.findMany({
        where: {
          id: { in: rows.map((row) => row.resolutionId).filter(Boolean) },
        },
      }),
      prisma.inspections.findMany({
        where: { id: { in: inspectionIds }, isDeleted: false },
        select: { category: true, id: true },
      }),
    ]);
    const decisionById = new Map(decisions.map((item) => [item.id, item]));
    const inspectionById = new Map(inspections.map((item) => [item.id, item]));
    for (const row of rows) {
      const decision = row.resolutionId
        ? decisionById.get(row.resolutionId)
        : undefined;
      if (!decision) continue;
      const inspection = inspectionById.get(row.entityId);
      const state = await resolveRawId({
        entityType: row.entityType,
        fieldName: row.fieldName,
        rawId: decision.rawId,
      });
      const nextState = getDeterministicUnresolvedClassification({
        category: inspection?.category || '',
        entityType: row.entityType,
        fieldName: row.fieldName,
        rawIdState: state,
      });
      if (!nextState) continue;
      await prisma.$transaction(async (tx) => {
        await HistoricalIdentityResolutionService.append(
          {
            canonicalId:
              nextState === 'RESOLVED' || nextState === 'RETIRED'
                ? decision.rawId
                : null,
            decisionNote: 'WP3 deterministic unresolved classification',
            decisionSource: 'OBSERVED_VALID_ID',
            entityId: decision.entityId,
            entityType: decision.entityType,
            evidence: decision.evidence || undefined,
            fieldName: decision.fieldName,
            rawId: decision.rawId,
            rawName: decision.rawName,
            state: nextState,
          },
          tx,
        );
      });
      if (nextState === 'INVALID_ID') invalidId += 1;
      if (nextState === 'NOT_APPLICABLE') notApplicable += 1;
      if (nextState === 'RESOLVED') resolved += 1;
      if (nextState === 'RETIRED') retired += 1;
    }
    afterId = rows.at(-1)?.id;
    if (rows.length < 200) break;
  }
  const staged = await IdentityProjectionService.createStagedGeneration();
  const passRateProjection = await PassRateProjectionService.buildGeneration(
    staged.generationId,
  );
  const publication =
    await IdentityProjectionService.publishStagedGeneration(staged);
  if (!publication.published) {
    throw new Error(`IDENTITY_PROJECTION_PUBLISH_FAILED:${publication.reason}`);
  }
  return {
    classified: { invalidId, notApplicable, resolved, retired },
    projection: { ...staged, ...passRateProjection, ...publication },
  };
}

if (process.argv[1]?.endsWith('classify-historical-identity-unresolved.ts')) {
  void classifyHistoricalIdentityUnresolved().then((summary) => {
    process.stdout.write(`${JSON.stringify(summary)}\n`);
  });
}
