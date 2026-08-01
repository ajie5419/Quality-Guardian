import prisma from '~/utils/prisma';

/** The projection is disposable; the ledger remains the only decision history. */
export const IdentityProjectionService = {
  async rebuild(params: { afterId?: string; pageSize?: number } = {}) {
    const pageSize = Math.min(Math.max(params.pageSize || 500, 1), 500);
    const rows = await prisma.historical_identity_resolutions.findMany({
      where: params.afterId ? { id: { gt: params.afterId } } : undefined,
      orderBy: [{ id: 'asc' }, { decisionVersion: 'desc' }],
      take: pageSize,
    });
    let written = 0;
    for (const row of rows) {
      const newer = await prisma.historical_identity_resolutions.findFirst({
        where: {
          decisionVersion: { gt: row.decisionVersion },
          entityId: row.entityId,
          entityType: row.entityType,
          fieldName: row.fieldName,
        },
        select: { id: true },
      });
      if (newer) continue;
      await prisma.identity_resolution_projection.upsert({
        where: {
          entityType_entityId_fieldName: {
            entityId: row.entityId,
            entityType: row.entityType,
            fieldName: row.fieldName,
          },
        },
        create: {
          effectiveCanonicalId: row.canonicalId,
          entityId: row.entityId,
          entityType: row.entityType,
          fieldName: row.fieldName,
          resolutionId: row.id,
          sourceFingerprint: row.sourceFingerprint,
          state: row.state,
        },
        update: {
          effectiveCanonicalId: row.canonicalId,
          projectionVersion: { increment: 1 },
          rebuiltAt: new Date(),
          resolutionId: row.id,
          sourceFingerprint: row.sourceFingerprint,
          state: row.state,
        },
      });
      written += 1;
    }
    return {
      nextAfterId: rows.at(-1)?.id || null,
      scanned: rows.length,
      written,
    };
  },

  async rebuildAll() {
    await prisma.identity_resolution_projection.deleteMany();
    let afterId: string | undefined;
    let scanned = 0;
    let written = 0;
    for (;;) {
      const page = await this.rebuild({ afterId });
      scanned += page.scanned;
      written += page.written;
      if (!page.nextAfterId || page.scanned < 500) return { scanned, written };
      afterId = page.nextAfterId;
    }
  },
};
