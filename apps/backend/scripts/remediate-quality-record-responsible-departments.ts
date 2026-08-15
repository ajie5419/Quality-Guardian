import process from 'node:process';

import { createModuleLogger } from '~/utils/logger';
import prisma from '~/utils/prisma';

const logger = createModuleLogger('quality-record-department-remediation');
const ENTITY_TYPE = 'quality_record';
const FIELD_NAME = 'responsibleDepartment';
const BATCH_SIZE = 500;

type Mode = 'apply' | 'dry-run';

interface DepartmentMapping {
  activeId: string;
  activeName: string;
  placeholderId: string;
}

function parseMode(argv: string[]): Mode {
  if (argv.includes('--apply')) return 'apply';
  return 'dry-run';
}

/**
 * Historical placeholder department rows (cuid ids, soft-deleted) hold the
 * legacy department id as their name. That legacy id is the id of the real,
 * active department, so each placeholder maps deterministically:
 *
 *   quality_records.responsibleDepartmentId (cuid)
 *     -> departments(name = legacy id) [soft-deleted placeholder]
 *     -> departments(id = legacy id)    [active real department]
 */
async function loadMappings(): Promise<DepartmentMapping[]> {
  const placeholders = await prisma.departments.findMany({
    select: { id: true, name: true },
    where: {
      id: {
        in: await prisma.quality_records
          .findMany({
            distinct: ['responsibleDepartmentId'],
            select: { responsibleDepartmentId: true },
            where: {
              isDeleted: false,
              responsibleDepartmentId: { not: null },
            },
          })
          .then((rows) =>
            rows
              .map((row) => row.responsibleDepartmentId || '')
              .filter(Boolean),
          ),
      },
      isDeleted: true,
    },
  });

  const mappings: DepartmentMapping[] = [];
  for (const placeholder of placeholders) {
    const legacyId = String(placeholder.name || '').trim();
    if (!legacyId) continue;
    const active = await prisma.departments.findFirst({
      select: { id: true, name: true },
      where: { id: legacyId, isDeleted: false },
    });
    if (!active) continue;
    mappings.push({
      activeId: active.id,
      activeName: active.name,
      placeholderId: placeholder.id,
    });
  }
  return mappings;
}

async function persistUnresolved(input: {
  entityId: string;
  mode: Mode;
  rawName: string;
}) {
  if (input.mode !== 'apply') return;
  await prisma.unresolved_master_data_refs.upsert({
    where: {
      entityType_entityId_fieldName: {
        entityId: input.entityId,
        entityType: ENTITY_TYPE,
        fieldName: FIELD_NAME,
      },
    },
    create: {
      entityId: input.entityId,
      entityType: ENTITY_TYPE,
      evidence: { rawName: input.rawName },
      fieldName: FIELD_NAME,
      rawName: input.rawName,
      reason:
        'responsible department placeholder soft-deleted with no active match',
    },
    update: {
      evidence: { rawName: input.rawName },
      isDeleted: false,
      rawName: input.rawName,
      reason:
        'responsible department placeholder soft-deleted with no active match',
    },
  });
}

async function main() {
  const mode = parseMode(process.argv.slice(2));
  const mappings = await loadMappings();
  const placeholderById = new Map(
    mappings.map((mapping) => [mapping.placeholderId, mapping]),
  );
  logger.info(
    { mappings: mappings.length, mode },
    'department placeholder mappings loaded',
  );

  let cursor: undefined | { id: string };
  let processed = 0;
  let resolved = 0;
  let unresolved = 0;
  let skipped = 0;

  for (;;) {
    const rows = await prisma.quality_records.findMany({
      ...(cursor ? { cursor, skip: 1 } : {}),
      orderBy: { id: 'asc' },
      select: {
        id: true,
        responsibleDepartment: true,
        responsibleDepartmentId: true,
      },
      take: BATCH_SIZE,
      where: {
        isDeleted: false,
        responsibleDepartmentId: { in: [...placeholderById.keys()] },
      },
    });
    if (rows.length === 0) break;

    for (const row of rows) {
      const mapping = placeholderById.get(
        String(row.responsibleDepartmentId || ''),
      );
      if (!mapping) {
        skipped += 1;
        continue;
      }
      if (mode === 'apply') {
        await prisma.quality_records.update({
          where: { id: row.id },
          data: {
            responsibleDepartment: mapping.activeName,
            responsibleDepartmentId: mapping.activeId,
          },
        });
      }
      resolved += 1;
      processed += 1;
    }

    cursor = { id: rows.at(-1)?.id ?? '' };
    if (rows.length < BATCH_SIZE) break;
  }

  // Unmapped placeholders: persist an unresolved audit so they stay tracked.
  const allPlaceholders = await prisma.departments.findMany({
    select: { id: true, name: true },
    where: {
      id: {
        in: await prisma.quality_records
          .findMany({
            distinct: ['responsibleDepartmentId'],
            select: { responsibleDepartmentId: true },
            where: {
              isDeleted: false,
              responsibleDepartmentId: { not: null },
            },
          })
          .then((rows) =>
            rows
              .map((row) => row.responsibleDepartmentId || '')
              .filter(Boolean),
          ),
      },
      isDeleted: true,
    },
  });
  for (const placeholder of allPlaceholders) {
    if (placeholderById.has(placeholder.id)) continue;
    const legacyId = String(placeholder.name || '').trim();
    const records = await prisma.quality_records.findMany({
      select: { id: true, responsibleDepartment: true },
      where: {
        isDeleted: false,
        responsibleDepartmentId: placeholder.id,
      },
    });
    for (const record of records) {
      await persistUnresolved({
        entityId: record.id,
        mode,
        rawName: String(record.responsibleDepartment || '').trim() || legacyId,
      });
      unresolved += 1;
      processed += 1;
    }
  }

  logger.info(
    { mode, processed, resolved, unresolved, skipped },
    'quality record responsible department remediation finished',
  );
  if (mode === 'dry-run') {
    logger.info(
      {
        command:
          'pnpm maintenance:welder-score:remediate-departments -- --apply',
      },
      'dry run only; pass --apply to persist department id/name fixes',
    );
  }
}

void main()
  .catch((error: unknown) => {
    logger.fatal(
      { err: error },
      'quality record responsible department remediation failed',
    );
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
