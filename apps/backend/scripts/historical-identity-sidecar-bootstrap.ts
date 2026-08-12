import process from 'node:process';

import {
  getCanonicalIdentityState,
  getIdentityRegistryEntry,
  HistoricalIdentityResolutionService,
  IdentityProjectionService,
} from '~/modules/master-data-identity';
import { PassRateProjectionService } from '~/modules/report';
import { isBusinessError } from '~/utils/business-error';
import prisma from '~/utils/prisma';

import { closeConnections } from './close-connections';

type Candidate = {
  entityId: string;
  entityType: string;
  fieldName: string;
  rawId: null | string;
  rawName: null | string;
};

async function resolveObservedIdentity(item: {
  entityType: string;
  fieldName: string;
  rawId: null | string;
}) {
  const rawId = String(item.rawId || '').trim();
  try {
    return {
      canonicalId: rawId,
      state: await getCanonicalIdentityState(
        item.entityType,
        item.fieldName,
        rawId,
      ),
    };
  } catch (error: unknown) {
    if (isBusinessError(error) && error.code === 'INVALID_CANONICAL_ID') {
      return { canonicalId: null, state: 'INVALID_ID' as const };
    }
    throw error;
  }
}

function parseOptions(args: string[]) {
  const apply = args.includes('--apply');
  const rebuild = args.includes('--rebuild');
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
        arg !== '--rebuild' &&
        !arg.startsWith('--page-size=') &&
        !arg.startsWith('--limit='),
    )
  ) {
    throw new Error('UNKNOWN_ARGUMENT');
  }
  return { apply, limit, pageSize, rebuild };
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
  afterId = undefined;
  for (;;) {
    const rows = await prisma.quality_records.findMany({
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
        responsibleDepartmentId: true,
        responsibleDepartment: true,
        divisionId: true,
        division: true,
        defectCategoryId: true,
        defectSubcategoryId: true,
        defectType: true,
        defectSubtype: true,
      },
    });
    for (const row of rows)
      candidates.push(
        {
          entityId: row.id,
          entityType: 'quality_records',
          fieldName: 'partId',
          rawId: row.partId,
          rawName: row.partName,
        },
        {
          entityId: row.id,
          entityType: 'quality_records',
          fieldName: 'processId',
          rawId: row.processId,
          rawName: row.processName,
        },
        {
          entityId: row.id,
          entityType: 'quality_records',
          fieldName: 'projectId',
          rawId: row.projectId,
          rawName: row.projectName,
        },
        {
          entityId: row.id,
          entityType: 'quality_records',
          fieldName: 'supplierId',
          rawId: row.supplierId,
          rawName: row.supplierName,
        },
        {
          entityId: row.id,
          entityType: 'quality_records',
          fieldName: 'responsibleDepartmentId',
          rawId: row.responsibleDepartmentId,
          rawName: row.responsibleDepartment,
        },
        {
          entityId: row.id,
          entityType: 'quality_records',
          fieldName: 'divisionId',
          rawId: row.divisionId,
          rawName: row.division,
        },
        {
          entityId: row.id,
          entityType: 'quality_records',
          fieldName: 'defectCategoryId',
          rawId: row.defectCategoryId,
          rawName: row.defectType,
        },
        {
          entityId: row.id,
          entityType: 'quality_records',
          fieldName: 'defectSubcategoryId',
          rawId: row.defectSubcategoryId,
          rawName: row.defectSubtype,
        },
      );
    afterId = rows.at(-1)?.id;
    if (rows.length < pageSize) break;
  }
  afterId = undefined;
  for (;;) {
    const rows = await prisma.qms_inspection_requests.findMany({
      where: { id: afterId ? { gt: afterId } : undefined, isDeleted: false },
      orderBy: { id: 'asc' },
      take: pageSize,
      select: {
        id: true,
        partId: true,
        partName: true,
        processId: true,
        processName: true,
        supplierId: true,
        teamId: true,
        team: true,
      },
    });
    for (const row of rows)
      candidates.push(
        {
          entityId: row.id,
          entityType: 'qms_inspection_requests',
          fieldName: 'partId',
          rawId: row.partId,
          rawName: row.partName,
        },
        {
          entityId: row.id,
          entityType: 'qms_inspection_requests',
          fieldName: 'processId',
          rawId: row.processId,
          rawName: row.processName,
        },
        {
          entityId: row.id,
          entityType: 'qms_inspection_requests',
          fieldName: 'supplierId',
          rawId: row.supplierId,
          rawName: null,
        },
        {
          entityId: row.id,
          entityType: 'qms_inspection_requests',
          fieldName: 'teamId',
          rawId: row.teamId,
          rawName: row.team,
        },
      );
    afterId = rows.at(-1)?.id;
    if (rows.length < pageSize) break;
  }
  afterId = undefined;
  for (;;) {
    const rows = await prisma.after_sales.findMany({
      where: { id: afterId ? { gt: afterId } : undefined, isDeleted: false },
      orderBy: { id: 'asc' },
      take: pageSize,
      select: {
        id: true,
        projectId: true,
        projectName: true,
        feedbackDeptId: true,
        feedbackDept: true,
        respDeptId: true,
        respDept: true,
        supplierBrandId: true,
        supplierBrand: true,
        partId: true,
        partName: true,
        divisionId: true,
        division: true,
        productCategoryId: true,
        productSubcategoryId: true,
        productType: true,
        productSubtype: true,
        defectCategoryId: true,
        defectSubcategoryId: true,
        defectType: true,
        defectSubtype: true,
      },
    });
    for (const row of rows)
      candidates.push(
        {
          entityId: row.id,
          entityType: 'after_sales',
          fieldName: 'projectId',
          rawId: row.projectId,
          rawName: row.projectName,
        },
        {
          entityId: row.id,
          entityType: 'after_sales',
          fieldName: 'feedbackDeptId',
          rawId: row.feedbackDeptId,
          rawName: row.feedbackDept,
        },
        {
          entityId: row.id,
          entityType: 'after_sales',
          fieldName: 'respDeptId',
          rawId: row.respDeptId,
          rawName: row.respDept,
        },
        {
          entityId: row.id,
          entityType: 'after_sales',
          fieldName: 'supplierBrandId',
          rawId: row.supplierBrandId,
          rawName: row.supplierBrand,
        },
        {
          entityId: row.id,
          entityType: 'after_sales',
          fieldName: 'partId',
          rawId: row.partId,
          rawName: row.partName,
        },
        {
          entityId: row.id,
          entityType: 'after_sales',
          fieldName: 'divisionId',
          rawId: row.divisionId,
          rawName: row.division,
        },
        {
          entityId: row.id,
          entityType: 'after_sales',
          fieldName: 'productCategoryId',
          rawId: row.productCategoryId,
          rawName: row.productType,
        },
        {
          entityId: row.id,
          entityType: 'after_sales',
          fieldName: 'productSubcategoryId',
          rawId: row.productSubcategoryId,
          rawName: row.productSubtype,
        },
        {
          entityId: row.id,
          entityType: 'after_sales',
          fieldName: 'defectCategoryId',
          rawId: row.defectCategoryId,
          rawName: row.defectType,
        },
        {
          entityId: row.id,
          entityType: 'after_sales',
          fieldName: 'defectSubcategoryId',
          rawId: row.defectSubcategoryId,
          rawName: row.defectSubtype,
        },
      );
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
  const validReferenceKeys = new Set(
    valid.map(
      (item) => `${item.entityType}:${item.entityId}:${item.fieldName}`,
    ),
  );
  const unresolved = auditRows.filter(
    (item) =>
      Boolean(getIdentityRegistryEntry(item.entityType, item.fieldName)) &&
      !validReferenceKeys.has(
        `${item.entityType}:${item.entityId}:${item.fieldName}`,
      ),
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
    const observed = await resolveObservedIdentity(item);
    await prisma.$transaction(async (tx) => {
      await HistoricalIdentityResolutionService.append(
        {
          ...item,
          canonicalId: observed.canonicalId,
          decisionSource: 'OBSERVED_VALID_ID',
          state: observed.state,
        },
        tx,
      );
    });
    decisions += 1;
  }
  for (const audit of limitedAudits) {
    let canonicalId = String(audit.resolvedId || '').trim() || null;
    let state:
      | 'INVALID_ID'
      | 'RESOLVED'
      | 'RETIRED'
      | 'UNKNOWN_PROVENANCE'
      | 'UNRESOLVED';
    if (canonicalId) {
      const observed = await resolveObservedIdentity({
        entityType: audit.entityType,
        fieldName: audit.fieldName,
        rawId: canonicalId,
      });
      canonicalId = observed.canonicalId;
      state = observed.state;
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
  const projection = options.rebuild
    ? await (async () => {
        const staged = await IdentityProjectionService.createStagedGeneration();
        const passRateProjection =
          await PassRateProjectionService.buildGeneration(staged.generationId);
        const publication =
          await IdentityProjectionService.publishStagedGeneration(staged);
        if (!publication.published) {
          throw new Error(
            `IDENTITY_PROJECTION_PUBLISH_FAILED:${publication.reason}`,
          );
        }
        return { ...staged, ...passRateProjection, ...publication };
      })()
    : null;
  return {
    apply: true,
    auditEvidence: unresolved.length,
    decisions,
    projection,
    validIdReferences: valid.length,
  };
}

if (process.argv[1]?.endsWith('historical-identity-sidecar-bootstrap.ts')) {
  void bootstrapHistoricalIdentitySidecar()
    .then(async (summary) => {
      process.stdout.write(`${JSON.stringify(summary)}\n`);
      await closeConnections();
    })
    .catch((error: unknown) => {
      console.error(error);
      void closeConnections().finally(() => {
        process.exitCode = 1;
      });
    });
}
