import process from 'node:process';

import {
  getCanonicalIdentityState,
  getIdentityRegistryEntry,
  HistoricalIdentityResolutionService,
  IdentityProjectionService,
} from '~/modules/master-data-identity';
import prisma from '~/utils/prisma';

type Candidate = {
  entityId: string;
  entityType: string;
  fieldName: string;
  rawId: null | string;
  rawName: null | string;
};

function parseOptions(args: string[]) {
  const apply = args.includes('--apply');
  const limitOption = args.find((arg) => arg.startsWith('--limit='));
  const pageSizeOption = args.find((arg) => arg.startsWith('--page-size='));
  const limit = Number(limitOption?.slice('--limit='.length) || 0);
  const pageSize = Number(pageSizeOption?.slice('--page-size='.length) || 200);
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 500) {
    throw new Error('INVALID_PAGE_SIZE');
  }
  if (!Number.isInteger(limit) || limit < 0) throw new Error('INVALID_LIMIT');
  if (
    args.some(
      (arg) =>
        arg !== '--apply' &&
        !arg.startsWith('--page-size=') &&
        !arg.startsWith('--limit='),
    )
  ) {
    throw new Error('UNKNOWN_ARGUMENT');
  }
  return { apply, limit, pageSize };
}

async function collectCandidates(pageSize: number) {
  const candidates: Candidate[] = [];
  let afterId: string | undefined;
  for (;;) {
    const rows = await prisma.inspections.findMany({
      where: { id: afterId ? { gt: afterId } : undefined, isDeleted: false },
      orderBy: { id: 'asc' },
      take: pageSize,
      select: {
        id: true,
        partId: true,
        partName: true,
        processId: true,
        processName: true,
        projectId: true,
        projectName: true,
        supplierId: true,
        supplierName: true,
        teamId: true,
        team: true,
      },
    });
    for (const row of rows) {
      candidates.push(
        {
          entityId: row.id,
          entityType: 'inspections',
          fieldName: 'partId',
          rawId: row.partId,
          rawName: row.partName,
        },
        {
          entityId: row.id,
          entityType: 'inspections',
          fieldName: 'processId',
          rawId: row.processId,
          rawName: row.processName,
        },
        {
          entityId: row.id,
          entityType: 'inspections',
          fieldName: 'projectId',
          rawId: row.projectId,
          rawName: row.projectName,
        },
        {
          entityId: row.id,
          entityType: 'inspections',
          fieldName: 'supplierId',
          rawId: row.supplierId,
          rawName: row.supplierName,
        },
        {
          entityId: row.id,
          entityType: 'inspections',
          fieldName: 'teamId',
          rawId: row.teamId,
          rawName: row.team,
        },
      );
    }
    afterId = rows.at(-1)?.id;
    if (rows.length < pageSize) break;
  }
  const auditRows = await prisma.unresolved_master_data_refs.findMany({
    where: { isDeleted: false },
    orderBy: { id: 'asc' },
    select: {
      entityId: true,
      entityType: true,
      evidence: true,
      fieldName: true,
      rawId: true,
      rawName: true,
      resolvedId: true,
      status: true,
    },
  });
  return { auditRows, candidates };
}

export async function bootstrapHistoricalIdentitySidecar(
  args = process.argv.slice(2),
) {
  const options = parseOptions(args);
  const { auditRows, candidates } = await collectCandidates(options.pageSize);
  const supported = candidates.filter((item) =>
    Boolean(getIdentityRegistryEntry(item.entityType, item.fieldName)),
  );
  const valid = supported.filter((item) =>
    Boolean(String(item.rawId || '').trim()),
  );
  const unresolved = auditRows.filter((item) =>
    Boolean(getIdentityRegistryEntry(item.entityType, item.fieldName)),
  );
  const limitedValid =
    options.limit > 0 ? valid.slice(0, options.limit) : valid;
  const remaining =
    options.limit > 0 ? Math.max(options.limit - limitedValid.length, 0) : 0;
  const limitedAudits =
    options.limit > 0 ? unresolved.slice(0, remaining) : unresolved;
  if (!options.apply) {
    return {
      apply: false,
      auditEvidence: unresolved.length,
      candidateReferences: supported.length,
      validIdReferences: valid.length,
    };
  }
  let decisions = 0;
  for (const item of limitedValid) {
    const state = await getCanonicalIdentityState(
      item.entityType,
      item.fieldName,
      String(item.rawId),
    );
    await prisma.$transaction(async (tx) => {
      await HistoricalIdentityResolutionService.append(
        {
          ...item,
          canonicalId: item.rawId,
          decisionSource: 'OBSERVED_VALID_ID',
          state,
        },
        tx,
      );
    });
    decisions += 1;
  }
  for (const audit of limitedAudits) {
    const canonicalId = String(audit.resolvedId || '').trim() || null;
    let state: 'RESOLVED' | 'RETIRED' | 'UNKNOWN_PROVENANCE' | 'UNRESOLVED';
    if (canonicalId) {
      state = await getCanonicalIdentityState(
        audit.entityType,
        audit.fieldName,
        canonicalId,
      );
    } else {
      state = audit.status === 'OPEN' ? 'UNRESOLVED' : 'UNKNOWN_PROVENANCE';
    }
    await prisma.$transaction(async (tx) => {
      await HistoricalIdentityResolutionService.append(
        {
          canonicalId,
          decisionSource: 'LEGACY_AUDIT',
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
    });
    decisions += 1;
  }
  const projection = await IdentityProjectionService.rebuildAll();
  return {
    apply: true,
    auditEvidence: unresolved.length,
    decisions,
    projection,
    validIdReferences: valid.length,
  };
}

if (process.argv[1]?.endsWith('historical-identity-sidecar-bootstrap.ts')) {
  void bootstrapHistoricalIdentitySidecar().then((summary) => {
    process.stdout.write(`${JSON.stringify(summary)}\n`);
  });
}
