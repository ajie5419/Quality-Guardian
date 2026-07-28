import type { inspection_category } from '@prisma/client';

import { createId } from '@paralleldrive/cuid2';
import prisma from '~/utils/prisma';

const CATEGORIES = ['INCOMING', 'PROCESS'] as const;
const DEFAULT_BATCH_SIZE = 500;

export interface ProcessOptionBootstrapResult {
  created: number;
  scanned: number;
}

function isConfiguredCategory(
  value: inspection_category | string,
): value is (typeof CATEGORIES)[number] {
  return value === 'INCOMING' || value === 'PROCESS';
}

export async function bootstrapInspectionRequestProcessOptions(
  batchSize = DEFAULT_BATCH_SIZE,
): Promise<ProcessOptionBootstrapResult> {
  let created = 0;
  let lastId: null | string = null;
  let scanned = 0;

  while (true) {
    const rows = await prisma.processes.findMany({
      where: {
        ...(lastId ? { id: { gt: lastId } } : {}),
        isDeleted: false,
      },
      orderBy: { id: 'asc' },
      take: batchSize,
      select: { id: true, inspectionRequestCategory: true, sort: true },
    });
    if (rows.length === 0) break;

    const result = await prisma.inspection_request_process_options.createMany({
      data: rows.flatMap((process) =>
        CATEGORIES.map((category) => ({
          id: createId(),
          category,
          isEnabled:
            isConfiguredCategory(process.inspectionRequestCategory) &&
            process.inspectionRequestCategory === category,
          processId: process.id,
          sort: process.sort,
        })),
      ),
      skipDuplicates: true,
    });
    created += result.count;
    scanned += rows.length;
    lastId = rows.at(-1)?.id ?? null;
    if (rows.length < batchSize) break;
  }

  for (const category of CATEGORIES) {
    const missing = await prisma.processes.count({
      where: {
        isDeleted: false,
        inspectionRequestOptions: { none: { category } },
      },
    });
    if (missing > 0) {
      throw new Error(
        `Process option bootstrap incomplete for ${category}: ${missing} missing`,
      );
    }
  }

  return { created, scanned };
}
