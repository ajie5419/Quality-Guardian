import type {
  historical_identity_resolution_state,
  Prisma,
} from '@prisma/client';

import prisma from '~/utils/prisma';

const CONTROL_KEY = 'historical-identity';

type ProjectionClient = Prisma.TransactionClient | typeof prisma;

type ProjectionDecision = {
  canonicalId: null | string;
  entityId: string;
  entityType: string;
  fieldName: string;
  id: string;
  sourceFingerprint: string;
  state: historical_identity_resolution_state;
};

type ProjectionRow = ProjectionDecision & { decisionVersion: number };

async function getOrCreateControl(client: ProjectionClient) {
  return client.identity_projection_generation_pointer.upsert({
    where: { key: CONTROL_KEY },
    create: { key: CONTROL_KEY },
    update: {},
  });
}

function toProjectionData(
  decision: ProjectionDecision,
  generationId: null | string,
) {
  return {
    effectiveCanonicalId: decision.canonicalId,
    entityId: decision.entityId,
    entityType: decision.entityType,
    fieldName: decision.fieldName,
    generationId,
    resolutionId: decision.id,
    sourceFingerprint: decision.sourceFingerprint,
    state: decision.state,
  };
}

/**
 * The generic projection is a generation-scoped read model. A generation is
 * never visible until the pointer CAS succeeds, so a failed rebuild leaves
 * readers on the previous complete generation.
 */
export const IdentityProjectionService = {
  async getActiveGenerationId(client: ProjectionClient = prisma) {
    const control =
      await client.identity_projection_generation_pointer.findUnique({
        where: { key: CONTROL_KEY },
        select: { activeGenerationId: true },
      });
    return control?.activeGenerationId || null;
  },

  async recordDecision(
    client: Prisma.TransactionClient,
    decision: ProjectionDecision,
  ) {
    const control = await getOrCreateControl(client);
    const projection = await client.identity_resolution_projection.upsert({
      where: {
        generationId_entityType_entityId_fieldName: {
          entityId: decision.entityId,
          entityType: decision.entityType,
          fieldName: decision.fieldName,
          generationId: control.activeGenerationId,
        },
      },
      create: toProjectionData(decision, control.activeGenerationId),
      update: {
        effectiveCanonicalId: decision.canonicalId,
        projectionVersion: { increment: 1 },
        rebuiltAt: new Date(),
        resolutionId: decision.id,
        sourceFingerprint: decision.sourceFingerprint,
        state: decision.state,
      },
    });
    await client.identity_projection_generation_pointer.update({
      where: { key: CONTROL_KEY },
      data: { resolutionVersion: { increment: 1 } },
    });
    return projection;
  },

  async createStagedGeneration() {
    const control = await getOrCreateControl(prisma);
    const generation = await prisma.identity_projection_generations.create({
      data: { sourceResolutionVersion: control.resolutionVersion },
    });
    try {
      const current = new Map<string, ProjectionRow>();
      let afterId: string | undefined;
      let scanned = 0;
      for (;;) {
        const rows = await prisma.historical_identity_resolutions.findMany({
          where: afterId ? { id: { gt: afterId } } : undefined,
          orderBy: { id: 'asc' },
          take: 200,
        });
        for (const row of rows) {
          const key = `${row.entityType}:${row.entityId}:${row.fieldName}`;
          const existing = current.get(key);
          if (!existing || row.decisionVersion > existing.decisionVersion) {
            current.set(key, row);
          }
        }
        scanned += rows.length;
        afterId = rows.at(-1)?.id;
        if (rows.length < 200) break;
      }
      const rows = [...current.values()];
      for (let offset = 0; offset < rows.length; offset += 200) {
        await prisma.identity_resolution_projection.createMany({
          data: rows
            .slice(offset, offset + 200)
            .map((row) => toProjectionData(row, generation.id)),
        });
      }
      return {
        generationId: generation.id,
        scanned,
        sourceResolutionVersion: control.resolutionVersion,
        written: rows.length,
      };
    } catch (error: unknown) {
      await prisma.identity_projection_generations.update({
        where: { id: generation.id },
        data: {
          failureReason:
            error instanceof Error ? error.message : 'Unknown error',
          status: 'FAILED',
        },
      });
      throw error;
    }
  },

  async publishStagedGeneration(params: {
    generationId: string;
    sourceResolutionVersion: number;
  }) {
    return prisma.$transaction(async (tx) => {
      const generation = await tx.identity_projection_generations.findUnique({
        where: { id: params.generationId },
        select: { id: true, status: true },
      });
      if (!generation || generation.status !== 'BUILDING') {
        return { published: false, reason: 'GENERATION_NOT_BUILDING' as const };
      }
      const swapped =
        await tx.identity_projection_generation_pointer.updateMany({
          where: {
            key: CONTROL_KEY,
            resolutionVersion: params.sourceResolutionVersion,
          },
          data: {
            activeGenerationId: params.generationId,
            switchedAt: new Date(),
          },
        });
      if (swapped.count !== 1) {
        await tx.identity_projection_generations.update({
          where: { id: params.generationId },
          data: {
            failureReason: 'Source decisions changed during generation build',
            status: 'FAILED',
          },
        });
        return { published: false, reason: 'SOURCE_CHANGED' as const };
      }
      await tx.identity_projection_generations.updateMany({
        where: {
          id: { not: params.generationId },
          status: 'ACTIVE',
        },
        data: { retiredAt: new Date(), status: 'RETIRED' },
      });
      await tx.identity_projection_generations.update({
        where: { id: params.generationId },
        data: { activatedAt: new Date(), status: 'ACTIVE' },
      });
      return { published: true, reason: null };
    });
  },

  async rebuildAll() {
    const staged = await this.createStagedGeneration();
    const publication = await this.publishStagedGeneration(staged);
    return { ...staged, ...publication };
  },
};
