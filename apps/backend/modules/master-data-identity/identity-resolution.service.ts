import type { Prisma } from '@prisma/client';

import { createHash } from 'node:crypto';

import { MasterDataResolutionAuditService } from '~/modules/supplier-identity';
import { BusinessError } from '~/utils/business-error';
import { createModuleLogger } from '~/utils/logger';
import prisma from '~/utils/prisma';
import { isPrismaUniqueConstraintError } from '~/utils/prisma-error';

import {
  getCanonicalIdentityState,
  getIdentityRegistryEntry,
} from './identity-registry';

const logger = createModuleLogger('HistoricalIdentityResolutionService');

type ResolutionClient = Prisma.TransactionClient;

export type IdentityResolutionState =
  | 'AMBIGUOUS'
  | 'CONFLICT'
  | 'INVALID_ID'
  | 'NOT_APPLICABLE'
  | 'RESOLVED'
  | 'RETIRED'
  | 'UNKNOWN_PROVENANCE'
  | 'UNRESOLVED';

export type IdentityDecisionSource =
  | 'LEGACY_AUDIT'
  | 'MANUAL_DECISION'
  | 'OBSERVED_VALID_ID';

type IdentityReference = {
  entityId: string;
  entityType: string;
  evidence?: Prisma.InputJsonValue;
  fieldName: string;
  rawId?: null | string;
  rawName?: null | string;
};

function normalize(value: null | string | undefined) {
  return String(value || '').trim();
}

export function createIdentitySourceFingerprint(reference: IdentityReference) {
  return createHash('sha256')
    .update(
      JSON.stringify({
        entityId: normalize(reference.entityId),
        entityType: normalize(reference.entityType),
        evidence: reference.evidence || null,
        fieldName: normalize(reference.fieldName),
        rawId: normalize(reference.rawId),
        rawName: normalize(reference.rawName),
      }),
    )
    .digest('hex');
}

function assertDecisionInput(params: {
  canonicalId?: null | string;
  decidedById?: null | string;
  decisionSource: IdentityDecisionSource;
  state: IdentityResolutionState;
}) {
  const canonicalId = normalize(params.canonicalId);
  const decidedById = normalize(params.decidedById);
  if (params.decisionSource === 'MANUAL_DECISION' && !decidedById) {
    throw new BusinessError(
      'MANUAL_RESOLUTION_OPERATOR_REQUIRED',
      'Manual identity decisions require the authenticated operator',
      400,
    );
  }
  if (params.decisionSource !== 'MANUAL_DECISION' && decidedById) {
    throw new BusinessError(
      'AUTOMATIC_RESOLUTION_OPERATOR_FORBIDDEN',
      'Automatic identity decisions cannot impersonate an operator',
      400,
    );
  }
  const requiresCanonicalId =
    params.state === 'RESOLVED' || params.state === 'RETIRED';
  if (requiresCanonicalId !== Boolean(canonicalId)) {
    throw new BusinessError(
      'IDENTITY_RESOLUTION_CANONICAL_ID_INVALID',
      'Resolution state and canonical ID are inconsistent',
      400,
    );
  }
}

async function appendDecision(
  client: ResolutionClient,
  params: IdentityReference & {
    canonicalId?: null | string;
    decidedById?: null | string;
    decisionNote?: null | string;
    decisionSource: IdentityDecisionSource;
    state: IdentityResolutionState;
    supersedesId?: null | string;
  },
) {
  assertDecisionInput(params);
  const sourceFingerprint = createIdentitySourceFingerprint(params);
  const matching = await client.historical_identity_resolutions.findFirst({
    where: {
      canonicalId: normalize(params.canonicalId) || null,
      entityId: normalize(params.entityId),
      entityType: normalize(params.entityType),
      fieldName: normalize(params.fieldName),
      sourceFingerprint,
      state: params.state,
    },
    orderBy: { decisionVersion: 'desc' },
  });
  if (matching && !params.supersedesId) return matching;
  const latest = await client.historical_identity_resolutions.findFirst({
    where: {
      entityId: normalize(params.entityId),
      entityType: normalize(params.entityType),
      fieldName: normalize(params.fieldName),
    },
    orderBy: { decisionVersion: 'desc' },
  });
  if (params.supersedesId && latest?.id !== params.supersedesId) {
    throw new BusinessError(
      'IDENTITY_RESOLUTION_CHANGED',
      'The identity decision changed before it could be superseded',
      409,
    );
  }
  const decisionVersion = (latest?.decisionVersion || 0) + 1;
  try {
    return await client.historical_identity_resolutions.create({
      data: {
        canonicalId: normalize(params.canonicalId) || null,
        decidedById: normalize(params.decidedById) || null,
        decisionNote: normalize(params.decisionNote) || null,
        decisionSource: params.decisionSource,
        entityId: normalize(params.entityId),
        entityType: normalize(params.entityType),
        evidence: params.evidence,
        fieldName: normalize(params.fieldName),
        rawId: normalize(params.rawId) || null,
        rawName: normalize(params.rawName) || null,
        sourceFingerprint,
        state: params.state,
        supersedesId: normalize(params.supersedesId) || null,
        decisionVersion,
      },
    });
  } catch (error: unknown) {
    logger.error(error, 'Failed to append historical identity decision');
    if (isPrismaUniqueConstraintError(error)) {
      throw new BusinessError(
        'IDENTITY_RESOLUTION_CHANGED',
        'The identity decision was updated concurrently',
        409,
      );
    }
    throw error;
  }
}

async function upsertProjection(
  client: ResolutionClient,
  decision: Awaited<ReturnType<typeof appendDecision>>,
) {
  return client.identity_resolution_projection.upsert({
    where: {
      entityType_entityId_fieldName: {
        entityId: decision.entityId,
        entityType: decision.entityType,
        fieldName: decision.fieldName,
      },
    },
    create: {
      effectiveCanonicalId: decision.canonicalId,
      entityId: decision.entityId,
      entityType: decision.entityType,
      fieldName: decision.fieldName,
      resolutionId: decision.id,
      sourceFingerprint: decision.sourceFingerprint,
      state: decision.state,
    },
    update: {
      effectiveCanonicalId: decision.canonicalId,
      projectionVersion: { increment: 1 },
      rebuiltAt: new Date(),
      resolutionId: decision.id,
      sourceFingerprint: decision.sourceFingerprint,
      state: decision.state,
    },
  });
}

export const HistoricalIdentityResolutionService = {
  async append(
    params: IdentityReference & {
      canonicalId?: null | string;
      decidedById?: null | string;
      decisionNote?: null | string;
      decisionSource: IdentityDecisionSource;
      state: IdentityResolutionState;
      supersedesId?: null | string;
    },
    client: ResolutionClient,
  ) {
    const decision = await appendDecision(client, params);
    const projection = await upsertProjection(client, decision);
    return { decision, projection };
  },

  async resolveManualWorkItem(params: {
    actorId: string;
    auditId: string;
    canonicalId: string;
    note: string;
  }) {
    const actorId = normalize(params.actorId);
    if (!actorId) {
      throw new BusinessError(
        'MANUAL_RESOLUTION_OPERATOR_REQUIRED',
        'Manual identity decisions require the authenticated operator',
        400,
      );
    }
    return prisma.$transaction(async (tx) => {
      const audit = await MasterDataResolutionAuditService.get(
        params.auditId,
        tx,
      );
      if (!audit || audit.status !== 'OPEN') {
        throw new BusinessError(
          'MASTER_DATA_REFERENCE_NOT_FOUND',
          'Open unresolved reference not found',
          404,
        );
      }
      if (!getIdentityRegistryEntry(audit.entityType, audit.fieldName)) {
        throw new BusinessError(
          'MASTER_DATA_REFERENCE_NOT_SUPPORTED',
          'This reference is not registered for identity resolution',
          400,
        );
      }
      const state = await getCanonicalIdentityState(
        audit.entityType,
        audit.fieldName,
        params.canonicalId,
      );
      const updated = await MasterDataResolutionAuditService.resolve(
        { id: audit.id, note: params.note, resolvedId: params.canonicalId },
        tx,
      );
      const { decision, projection } = await this.append(
        {
          canonicalId: params.canonicalId,
          decidedById: actorId,
          decisionNote: params.note,
          decisionSource: 'MANUAL_DECISION',
          entityId: audit.entityId,
          entityType: audit.entityType,
          evidence: audit.evidence || undefined,
          fieldName: audit.fieldName,
          rawId: audit.rawId,
          rawName: audit.rawName,
          state,
        },
        tx,
      );
      return {
        auditId: audit.id,
        decision,
        projection,
        resolvedAuditCount: updated.count,
      };
    });
  },

  async supersedeManualDecision(params: {
    actorId: string;
    canonicalId: string;
    decisionId: string;
    note: string;
  }) {
    const actorId = normalize(params.actorId);
    if (!actorId) {
      throw new BusinessError(
        'MANUAL_RESOLUTION_OPERATOR_REQUIRED',
        'Manual identity decisions require the authenticated operator',
        400,
      );
    }
    return prisma.$transaction(async (tx) => {
      const previous = await tx.historical_identity_resolutions.findUnique({
        where: { id: normalize(params.decisionId) },
      });
      if (!previous) {
        throw new BusinessError(
          'IDENTITY_RESOLUTION_NOT_FOUND',
          'Identity decision not found',
          404,
        );
      }
      const state = await getCanonicalIdentityState(
        previous.entityType,
        previous.fieldName,
        params.canonicalId,
      );
      const result = await this.append(
        {
          canonicalId: params.canonicalId,
          decidedById: actorId,
          decisionNote: params.note,
          decisionSource: 'MANUAL_DECISION',
          entityId: previous.entityId,
          entityType: previous.entityType,
          evidence: previous.evidence || undefined,
          fieldName: previous.fieldName,
          rawId: previous.rawId,
          rawName: previous.rawName,
          state,
          supersedesId: previous.id,
        },
        tx,
      );
      return result;
    });
  },
};
