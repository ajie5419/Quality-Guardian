import type { historical_identity_resolution_state } from '@prisma/client';

import prisma from '~/utils/prisma';

/** Rebuild reads the ledger once and writes projection rows in bounded batches. */
export const IdentityProjectionService = {
  async rebuildAll() {
    const current = new Map<
      string,
      {
        canonicalId: null | string;
        decisionVersion: number;
        entityId: string;
        entityType: string;
        fieldName: string;
        id: string;
        sourceFingerprint: string;
        state: historical_identity_resolution_state;
      }
    >();
    let afterId: string | undefined;
    let scanned = 0;
    for (;;) {
      const rows = await prisma.historical_identity_resolutions.findMany({
        where: afterId ? { id: { gt: afterId } } : undefined,
        orderBy: { id: 'asc' },
        take: 50,
      });
      for (const row of rows) {
        const key = `${row.entityType}:${row.entityId}:${row.fieldName}`;
        const existing = current.get(key);
        if (!existing || row.decisionVersion > existing.decisionVersion) {
          current.set(key, row as never);
        }
      }
      scanned += rows.length;
      afterId = rows.at(-1)?.id;
      if (rows.length < 50) break;
    }
    await prisma.identity_resolution_projection.deleteMany();
    const rows = [...current.values()];
    for (let offset = 0; offset < rows.length; offset += 50) {
      await prisma.identity_resolution_projection.createMany({
        data: rows.slice(offset, offset + 50).map((row) => ({
          effectiveCanonicalId: row.canonicalId,
          entityId: row.entityId,
          entityType: row.entityType,
          fieldName: row.fieldName,
          resolutionId: row.id,
          sourceFingerprint: row.sourceFingerprint,
          state: row.state,
        })),
      });
    }
    return { scanned, written: rows.length };
  },
};
