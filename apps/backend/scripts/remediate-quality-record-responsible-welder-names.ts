import process from 'node:process';

import { createModuleLogger } from '~/utils/logger';
import prisma from '~/utils/prisma';

const logger = createModuleLogger('quality-record-welder-name-remediation');
const BATCH_SIZE = 500;

type Mode = 'apply' | 'dry-run';

interface WelderHit {
  id: string;
  name: string;
}

function parseMode(argv: string[]): Mode {
  if (argv.includes('--apply')) return 'apply';
  return 'dry-run';
}

async function main() {
  const mode = parseMode(process.argv.slice(2));
  const welders = await prisma.welders.findMany({
    select: { id: true, name: true, welderCode: true },
  });
  const byId = new Map<string, WelderHit>();
  const byCode = new Map<string, WelderHit>();
  for (const welder of welders) {
    const name = String(welder.name || '').trim();
    if (!name) continue;
    byId.set(welder.id, { id: welder.id, name });
    const code = String(welder.welderCode || '').trim();
    if (code) byCode.set(code, { id: welder.id, name });
  }

  let cursor: undefined | { id: string };
  let processed = 0;
  let resolvedById = 0;
  let resolvedByCode = 0;
  let conflicts = 0;
  let skipped = 0;

  for (;;) {
    const rows = await prisma.quality_records.findMany({
      ...(cursor ? { cursor, skip: 1 } : {}),
      orderBy: { id: 'asc' },
      select: {
        id: true,
        responsibleWelder: true,
        responsibleWelderId: true,
      },
      take: BATCH_SIZE,
      where: { isDeleted: false, responsibleWelder: { not: null } },
    });
    if (rows.length === 0) break;

    for (const row of rows) {
      const raw = String(row.responsibleWelder || '').trim();
      if (!raw) {
        skipped += 1;
        continue;
      }
      const hitById = byId.get(raw);
      const hitByCode = hitById ? undefined : byCode.get(raw);
      const hit = hitById ?? hitByCode;
      if (!hit || hit.name === raw) {
        // Either a real name snapshot or an unknown id/code: leave untouched.
        skipped += 1;
        continue;
      }

      const persistedId = String(row.responsibleWelderId || '').trim();
      const idConflicts = persistedId && persistedId !== hit.id;
      if (mode === 'apply') {
        await prisma.quality_records.update({
          where: { id: row.id },
          data: idConflicts
            ? { responsibleWelder: hit.name }
            : { responsibleWelder: hit.name, responsibleWelderId: hit.id },
        });
      }
      if (hitById) {
        resolvedById += 1;
      } else {
        resolvedByCode += 1;
      }
      if (idConflicts) conflicts += 1;
      processed += 1;
    }

    cursor = { id: rows.at(-1)?.id ?? '' };
    if (rows.length < BATCH_SIZE) break;
  }

  logger.info(
    { mode, processed, resolvedById, resolvedByCode, conflicts, skipped },
    'quality record welder name remediation finished',
  );
  if (mode === 'dry-run') {
    logger.info(
      {
        command: 'pnpm maintenance:welder-score:remediate-names -- --apply',
      },
      'dry run only; pass --apply to persist name/id fixes',
    );
  }
}

void main()
  .catch((error: unknown) => {
    logger.fatal(
      { err: error },
      'quality record welder name remediation failed',
    );
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
