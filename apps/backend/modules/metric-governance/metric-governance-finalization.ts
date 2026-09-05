import prisma from '~/utils/prisma';

import {
  APPROVAL_EVIDENCE,
  APPROVAL_SOURCE_DOCUMENT,
  approvalEvidenceCreateInput,
  ownerAssignmentCreateInput,
} from './metric-governance-finalization-approval';
import { approvedCanonicalMetricDefinitions } from './metric-governance-finalization-definitions';

const canonicalMappings = [
  ['BM-PASS-RATE', 'BM-FIRST-PASS-YIELD', 'D01'],
  ['BM-PASS-RATE', 'BM-FINAL-PASS-RATE', 'D01,D02'],
  ['BM-QUALITY-LOSS-TREND', 'BM-GROSS-QUALITY-LOSS', 'D03'],
  ['BM-QUALITY-LOSS-TREND', 'BM-NET-QUALITY-LOSS', 'D03'],
  ['BM-QUALITY-LOSS-TREND', 'BM-CLAIM-RECOVERY', 'D03'],
  [
    'BM-WORK-ORDER-INSPECTION-COMPLETION',
    'BM-INSPECTION-POINT-COMPLETION',
    'D07',
  ],
  [
    'BM-WORK-ORDER-INSPECTION-COMPLETION',
    'BM-INSPECTION-QUANTITY-COVERAGE',
    'D07',
  ],
  [
    'BM-WORK-ORDER-INSPECTION-COMPLETION',
    'BM-INSPECTION-REQUEST-CLOSURE-RATE',
    'D07',
  ],
  ['BM-VEHICLE-FAILURE-INTENSITY', 'BM-VEHICLE-FAILURE-COUNT', 'D08'],
  ['BM-DFMEA-RPN-RISK', 'BM-DFMEA-RPN-VALUE', 'D11'],
  ['BM-DFMEA-RPN-RISK', 'BM-DFMEA-RISK-BAND', 'D11,D12'],
] as const;

async function ensureApprovedVersion(
  definition: (typeof approvedCanonicalMetricDefinitions)[number],
) {
  const existing = await prisma.metric_definitions.findUnique({
    where: { metricCode: definition.metricCode },
    include: { versions: { orderBy: { version: 'desc' } } },
  });
  if (!existing) {
    return prisma.metric_definitions.create({
      data: {
        metricCode: definition.metricCode,
        metricName: definition.metricName,
        domain: definition.domain,
        category: definition.category,
        ownerDeptId: null,
        ownerStatus: 'CONFIRMED_FROM_APPROVAL',
        status: 'DRAFT',
        currentVersion: 1,
        ownerAssignments: {
          create: ownerAssignmentCreateInput(definition.metricCode),
        },
        versions: {
          create: {
            ...definition.version,
            version: 1,
            decisionHistoryId: definition.decisionHistoryId,
            approvalEvidence: APPROVAL_EVIDENCE,
            sourceDocument: APPROVAL_SOURCE_DOCUMENT,
            approvalEvidences: {
              create: approvalEvidenceCreateInput(definition.decisionHistoryId),
            },
            policyDependencies: definition.policyDependencies
              ? {
                  create: definition.policyDependencies.map((dependency) => ({
                    ...dependency,
                    sourceDocument: APPROVAL_SOURCE_DOCUMENT,
                  })),
                }
              : undefined,
          },
        },
      },
      include: { versions: { orderBy: { version: 'desc' } } },
    });
  }

  const approvedVersion = existing.versions.find(
    (item) => item.decisionHistoryId === definition.decisionHistoryId,
  );
  if (approvedVersion) return existing;

  return prisma.$transaction(async (tx) => {
    const update = await tx.metric_definitions.updateMany({
      where: { id: existing.id, status: 'DRAFT', revision: existing.revision },
      data: {
        ownerDeptId: null,
        ownerStatus: 'CONFIRMED_FROM_APPROVAL',
        currentVersion: existing.currentVersion + 1,
        revision: { increment: 1 },
      },
    });
    if (update.count !== 1) {
      throw new Error(
        `Metric registry changed while finalizing ${definition.metricCode}`,
      );
    }
    await tx.metric_owner_assignments.createMany({
      data: ownerAssignmentCreateInput(definition.metricCode).map((owner) => ({
        ...owner,
        metricDefinitionId: existing.id,
      })),
      skipDuplicates: true,
    });
    await tx.metric_definition_versions.create({
      data: {
        ...definition.version,
        metricDefinitionId: existing.id,
        version: existing.currentVersion + 1,
        decisionHistoryId: definition.decisionHistoryId,
        approvalEvidence: APPROVAL_EVIDENCE,
        sourceDocument: APPROVAL_SOURCE_DOCUMENT,
        approvalEvidences: {
          create: approvalEvidenceCreateInput(definition.decisionHistoryId),
        },
        policyDependencies: definition.policyDependencies
          ? {
              create: definition.policyDependencies.map((dependency) => ({
                ...dependency,
                sourceDocument: APPROVAL_SOURCE_DOCUMENT,
              })),
            }
          : undefined,
      },
    });
    return tx.metric_definitions.findUniqueOrThrow({
      where: { id: existing.id },
      include: { versions: { orderBy: { version: 'desc' } } },
    });
  });
}

/**
 * Applies PHASE-1.6B human approval evidence as DRAFT registry metadata.
 * It is idempotent, never activates a definition, and preserves all prior
 * versions. It must run before any PHASE-2 shadow-validation work.
 */
export async function finalizeApprovedMetricRegistry() {
  const definitionsByCode = new Map<
    string,
    {
      currentVersion: number;
      id: string;
      versions: Array<{ id: string; version: number }>;
    }
  >();
  for (const definition of approvedCanonicalMetricDefinitions) {
    const finalized = await ensureApprovedVersion(definition);
    definitionsByCode.set(definition.metricCode, finalized);
  }

  for (const [
    legacyMetricCode,
    canonicalMetricCode,
    decisionHistoryId,
  ] of canonicalMappings) {
    const legacy = await prisma.metric_definitions.findUnique({
      where: { metricCode: legacyMetricCode },
      select: { id: true },
    });
    const canonical = definitionsByCode.get(canonicalMetricCode);
    const canonicalVersion = canonical?.versions.find(
      (version) => version.version === canonical.currentVersion,
    );
    if (!legacy || !canonicalVersion) continue;
    const existing = await prisma.metric_canonical_mappings.findUnique({
      where: {
        legacyMetricDefinitionId_canonicalMetricDefinitionVersionId: {
          legacyMetricDefinitionId: legacy.id,
          canonicalMetricDefinitionVersionId: canonicalVersion.id,
        },
      },
      select: { id: true },
    });
    if (existing) continue;
    await prisma.metric_canonical_mappings.create({
      data: {
        legacyMetricDefinitionId: legacy.id,
        canonicalMetricDefinitionVersionId: canonicalVersion.id,
        decisionHistoryId,
        mappingType: 'SPLIT_TO',
        sourceDocument: APPROVAL_SOURCE_DOCUMENT,
      },
    });
  }

  return {
    canonicalMetricCount: approvedCanonicalMetricDefinitions.length,
    mappingCount: canonicalMappings.length,
  };
}

export { approvedCanonicalMetricDefinitions, canonicalMappings };
