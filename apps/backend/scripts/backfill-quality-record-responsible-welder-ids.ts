import process from 'node:process';

import { resolveWelderIdByResponsibleText } from '@qgs/shared';
import { createModuleLogger } from '~/utils/logger';
import prisma from '~/utils/prisma';

const logger = createModuleLogger('quality-record-responsible-welder-backfill');
const ENTITY_TYPE = 'quality_record';
const FIELD_NAME = 'responsibleWelder';
const BATCH_SIZE = 500;

type BackfillMode = 'apply' | 'dry-run';

function parseMode(argv: string[]): BackfillMode {
  if (argv.includes('--apply')) return 'apply';
  if (argv.includes('--dry-run')) return 'dry-run';
  return 'dry-run';
}

async function persistUnresolved(input: {
  entityId: string;
  mode: BackfillMode;
  rawName: string;
  reason: string;
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
      reason: input.reason,
    },
    update: {
      evidence: { rawName: input.rawName },
      isDeleted: false,
      rawName: input.rawName,
      reason: input.reason,
    },
  });
}

async function main() {
  const mode = parseMode(process.argv.slice(2));
  const welders = await prisma.welders.findMany({
    where: { isDeleted: false },
    select: { id: true, name: true, welderCode: true },
  });

  let cursor: undefined | { id: string };
  let processed = 0;
  let resolved = 0;
  let unresolved = 0;
  let skipped = 0;

  for (;;) {
    const rows = await prisma.quality_records.findMany({
      ...(cursor ? { cursor, skip: 1 } : {}),
      orderBy: { id: 'asc' },
      select: { id: true, responsibleWelder: true },
      take: BATCH_SIZE,
      where: {
        isDeleted: false,
        responsibleWelder: { not: null },
        responsibleWelderId: null,
      },
    });
    if (rows.length === 0) break;

    for (const row of rows) {
      const rawName = String(row.responsibleWelder || '').trim();
      if (!rawName) {
        skipped += 1;
        continue;
      }
      const welderId = resolveWelderIdByResponsibleText({
        responsibleWelder: rawName,
        welderCandidates: welders,
      });
      if (welderId) {
        if (mode === 'apply') {
          await prisma.quality_records.update({
            where: { id: row.id },
            data: { responsibleWelderId: welderId },
          });
        }
        resolved += 1;
      } else {
        await persistUnresolved({
          entityId: row.id,
          mode,
          rawName,
          reason: 'responsible welder could not be uniquely resolved',
        });
        unresolved += 1;
      }
      processed += 1;
    }

    cursor = { id: rows.at(-1)?.id ?? '' };
    if (rows.length < BATCH_SIZE) break;
  }

  logger.info(
    { mode, processed, resolved, unresolved, skipped },
    'quality record responsible welder id backfill finished',
  );
  if (mode === 'dry-run') {
    logger.info(
      { command: 'pnpm maintenance:welder-score:backfill-ids -- --apply' },
      'dry run only; pass --apply to persist ids and unresolved audits',
    );
  }
}

void main()
  .catch((error: unknown) => {
    logger.fatal(
      { err: error },
      'quality record responsible welder id backfill failed',
    );
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
