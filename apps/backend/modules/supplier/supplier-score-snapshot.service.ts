import type { Prisma, suppliers } from '@prisma/client';

import type { SupplierStats } from './supplier-scoring';

import { resolveSupplierInspectionPolicy } from '@qgs/shared';
import { AfterSalesAPI } from '~/modules/after-sales';
import { InspectionService } from '~/modules/inspection';
import { SupplierIdentityService } from '~/modules/supplier-identity';
import prisma from '~/utils/prisma';

import {
  applyRecordsToStats,
  classifyDefect,
  createEmptyStats,
  scoreSupplierListItem,
} from './supplier-scoring';

type SupplierSnapshotInput = Pick<
  suppliers,
  | 'category'
  | 'id'
  | 'name'
  | 'outsourcingMode'
  | 'qualityScore'
  | 'rating'
  | 'status'
>;

const SUPPLIER_SNAPSHOT_CHUNK_SIZE = 50;
export const CURRENT_SUPPLIER_SCORING_MODELS = [
  'IN_HOUSE_OUTSOURCING_V4',
  'SUPPLIER_V4',
] as const;

async function buildSupplierStatsMap(suppliers: SupplierSnapshotInput[]) {
  const statsMap = new Map<string, SupplierStats>();
  if (suppliers.length === 0) return statsMap;

  const now = new Date();
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(now.getFullYear() - 1);

  const supplierById = new Map(
    suppliers.map((supplier) => [supplier.id, supplier]),
  );
  const incomingSuppliers = suppliers.filter(
    (supplier) =>
      resolveSupplierInspectionPolicy(supplier).inspectionCategory ===
      'INCOMING',
  );
  const processSuppliers = suppliers.filter(
    (supplier) =>
      resolveSupplierInspectionPolicy(supplier).inspectionCategory ===
      'PROCESS',
  );
  const teamIdsBySupplier = await SupplierIdentityService.teamIdsBySupplierIds(
    processSuppliers.map((supplier) => supplier.id),
  );
  const supplierByTeamId = new Map<string, SupplierSnapshotInput>();
  for (const supplier of processSuppliers) {
    for (const teamId of teamIdsBySupplier.get(supplier.id) || []) {
      supplierByTeamId.set(teamId, supplier);
    }
  }
  const resolveSupplierIdentity = (record: { supplierId?: null | string }) => {
    return record.supplierId ? supplierById.get(record.supplierId) : undefined;
  };
  const resolveTeamIdentity = (record: { teamId?: null | string }) => {
    return record.teamId ? supplierByTeamId.get(record.teamId) : undefined;
  };
  const getStats = (supplier: SupplierSnapshotInput) =>
    statsMap.get(supplier.id) || createEmptyStats();

  const [inspectionScoring, afterSalesScoring] = await Promise.all([
    InspectionService.getSupplierScoringData({
      engineeringSupplierIds: suppliers.map((item) => item.id),
      incomingSupplierIds: incomingSuppliers.map((item) => item.id),
      processTeamIds: processSuppliers.flatMap(
        (item) => teamIdsBySupplier.get(item.id) || [],
      ),
      since: oneYearAgo,
    }),
    AfterSalesAPI.getSupplierScoringData({
      since: oneYearAgo,
      supplierIds: suppliers.map((item) => item.id),
    }),
  ]);
  const {
    incomingStats,
    engineeringStats,
    engineeringStatusStats,
    records: recentQualityRecords,
  } = inspectionScoring;
  const engineeringTotalStats =
    inspectionScoring.engineeringTotalStats ?? engineeringStats;
  const {
    stats: afterSalesStats,
    statusStats: afterSalesStatusStats,
    records: recentAfterSales,
  } = afterSalesScoring;

  incomingStats.forEach((s) => {
    if (s.result === 'NA') return;
    const supplier =
      s.category === 'PROCESS'
        ? resolveTeamIdentity(s)
        : resolveSupplierIdentity(s);
    if (!supplier) return;
    const current = getStats(supplier);
    current.count += s._count.id;
    current.quantity += s._sum.quantity || 0;
    if (s.result === 'PASS') {
      current.qualifiedCount += s._count.id;
    } else {
      current.failures += s._count.id;
      current.failuresQuantity += s._sum.quantity || 0;
    }
    statsMap.set(supplier.id, current);
  });

  afterSalesStats.forEach((s) => {
    const supplier = s.supplierBrandId
      ? supplierById.get(s.supplierBrandId)
      : undefined;
    if (!supplier) return;
    const current = getStats(supplier);
    current.afterSalesLoss +=
      Number(s._sum.materialCost || 0) + Number(s._sum.laborTravelCost || 0);
    current.afterSalesCount += s._count.id;
    statsMap.set(supplier.id, current);
  });

  engineeringStats.forEach((s) => {
    const supplier = resolveSupplierIdentity(s);
    if (!supplier) return;
    const current = getStats(supplier);
    current.engineeringLoss += Number(s._sum.lossAmount || 0);
    current.engineeringCount += s._count.id;
    current.engineeringDefectQuantity += s._sum.quantity || 0;
    statsMap.set(supplier.id, current);
  });

  engineeringTotalStats.forEach((s) => {
    const supplier = resolveSupplierIdentity(s);
    if (!supplier) return;
    const current = getStats(supplier);
    current.engineeringTotalCount += s._count.id;
    statsMap.set(supplier.id, current);
  });

  engineeringStatusStats.forEach((s) => {
    if (s.status !== 'OPEN') return;
    const supplier = resolveSupplierIdentity(s);
    if (!supplier) return;
    const current = getStats(supplier);
    current.openEngineeringCount += s._count.id;
    statsMap.set(supplier.id, current);
  });

  afterSalesStatusStats.forEach((s) => {
    if (
      ['CANCELLED', 'CLOSED', 'COMPLETED', 'RESOLVED'].includes(s.claimStatus)
    ) {
      return;
    }
    const supplier = s.supplierBrandId
      ? supplierById.get(s.supplierBrandId)
      : undefined;
    if (!supplier) return;
    const current = getStats(supplier);
    current.openAfterSalesCount += s._count.id;
    statsMap.set(supplier.id, current);
  });

  const supplierRecords = new Map<
    string,
    Array<{
      date: Date;
      loss: number;
      origin: 'afterSales' | 'qualityRecords';
      type: 'A' | 'B' | 'C' | null;
    }>
  >();

  const combinedRecords = [
    ...recentAfterSales.map((r) => ({
      ...r,
      origin: 'afterSales' as const,
    })),
    ...recentQualityRecords.map((r) => ({
      ...r,
      origin: 'qualityRecords' as const,
    })),
  ];

  combinedRecords.forEach((r) => {
    let supplier: SupplierSnapshotInput | undefined;
    if (r.origin === 'qualityRecords') {
      supplier = resolveSupplierIdentity(r);
    } else if (r.supplierBrandId) {
      supplier = supplierById.get(r.supplierBrandId);
    }
    if (!supplier) return;

    const loss =
      r.origin === 'afterSales'
        ? Number(r.materialCost || 0) + Number(r.laborTravelCost || 0)
        : Number(r.lossAmount || 0);
    const date =
      r.origin === 'afterSales' ? new Date(r.occurDate) : new Date(r.date);
    const records = supplierRecords.get(supplier.id) || [];
    records.push({
      type: classifyDefect(loss, r.severity || undefined),
      loss,
      date,
      origin: r.origin,
    });
    supplierRecords.set(supplier.id, records);
  });

  supplierRecords.forEach((records, supplierId) => {
    const current = statsMap.get(supplierId) || createEmptyStats();
    records.sort((a, b) => b.date.getTime() - a.date.getTime());
    statsMap.set(supplierId, applyRecordsToStats(current, records));
  });

  return statsMap;
}

function toSnapshotData(
  supplier: SupplierSnapshotInput,
  stat: SupplierStats,
): Prisma.supplier_score_snapshotsUncheckedCreateInput {
  const scored = scoreSupplierListItem(
    {
      id: supplier.id,
      name: supplier.name,
      category: supplier.category,
      outsourcingMode: supplier.outsourcingMode,
      qualityScore: supplier.qualityScore ?? 100,
      rating: supplier.rating || 'A',
      status: supplier.status || 'Qualified',
    },
    stat,
  );

  return {
    supplierId: supplier.id,
    supplierName: supplier.name,
    category: supplier.category,
    outsourcingMode: String(scored.outsourcingMode || ''),
    incomingQualifiedRate: Number(scored.incomingQualifiedRate ?? 100),
    incomingScore: Number(scored.incomingScore ?? 100),
    incomingBatchCount: Number(scored.incomingBatchCount || 0),
    incomingTotalQuantity: Number(scored.incomingTotalQuantity || 0),
    engineeringIssueCount: Number(
      stat.engineeringTotalCount ?? scored.engineeringIssueCount ?? 0,
    ),
    engineeringScore: Number(scored.engineeringScore ?? 100),
    afterSalesIssueCount: Number(scored.afterSalesIssueCount || 0),
    afterSalesScore: Number(scored.afterSalesScore ?? 100),
    totalEngineeringLoss: Number(scored.totalEngineeringLoss || 0),
    totalAfterSalesLoss: Number(scored.totalAfterSalesLoss || 0),
    finalQualityScore: Number(scored.qualityScore || 0),
    finalRating: String(scored.level || scored.rating || 'A'),
    finalStatus: String(scored.status || 'Qualified'),
    isWarning: Boolean(scored.isWarning),
    scoringModel: `${String(scored.scoringModel || 'SUPPLIER')}_V4`,
    stabilityScore: Number(scored.stabilityScore ?? 100),
    warningReasons: scored.warningReasons,
    calculatedAt: new Date(),
    isDeleted: false,
  };
}

async function refreshSupplierChunk(suppliers: SupplierSnapshotInput[]) {
  const statsMap = await buildSupplierStatsMap(suppliers);
  await Promise.all(
    suppliers.map((supplier) => {
      const data = toSnapshotData(
        supplier,
        statsMap.get(supplier.id) || createEmptyStats(),
      );
      return prisma.supplier_score_snapshots.upsert({
        where: { supplierId: supplier.id },
        create: data,
        update: {
          ...data,
          updatedAt: new Date(),
        },
      });
    }),
  );
  return suppliers.length;
}

export const SupplierScoreSnapshotService = {
  async refreshSuppliers(suppliers: SupplierSnapshotInput[]) {
    let processed = 0;
    for (
      let index = 0;
      index < suppliers.length;
      index += SUPPLIER_SNAPSHOT_CHUNK_SIZE
    ) {
      processed += await refreshSupplierChunk(
        suppliers.slice(index, index + SUPPLIER_SNAPSHOT_CHUNK_SIZE),
      );
    }
    return { processed };
  },

  async refreshBySupplierIds(supplierIds: string[]) {
    const ids = [
      ...new Set(supplierIds.map((id) => id.trim()).filter(Boolean)),
    ];
    if (ids.length === 0) return;
    const suppliers = await prisma.suppliers.findMany({
      where: { id: { in: ids }, isDeleted: false },
    });
    return this.refreshSuppliers(suppliers);
  },
};
