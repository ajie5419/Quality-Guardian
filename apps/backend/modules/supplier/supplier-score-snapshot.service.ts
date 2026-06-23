import type { Prisma, suppliers } from '@prisma/client';

import type { SupplierStats } from './supplier-scoring';

import { AfterSalesAPI } from '~/modules/after-sales';
import { InspectionService } from '~/modules/inspection';
import { MasterDataGovernanceKernel } from '~/utils/canonical-master-data';
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

interface SupplierScoreRefreshOptions {
  batchSize?: number;
  maxBatches?: number;
}

function uniqueSupplierNames(names: Array<null | string | undefined>) {
  return [
    ...new Set(names.map((name) => String(name || '').trim()).filter(Boolean)),
  ];
}

async function buildSupplierStatsMap(supplierNames: string[]) {
  const statsMap = new Map<string, SupplierStats>();
  if (supplierNames.length === 0) return statsMap;

  const now = new Date();
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(now.getFullYear() - 1);

  const supplierNameToId =
    await MasterDataGovernanceKernel.resolveCanonicalIdsByNames({
      configKey: 'supplierName',
      names: supplierNames,
    });
  const supplierIds = [...supplierNameToId.values()].filter(
    Boolean,
  ) as string[];
  const [inspectionScoring, afterSalesScoring] = await Promise.all([
    InspectionService.getSupplierScoringData({
      since: oneYearAgo,
      supplierIds,
      supplierNames,
    }),
    AfterSalesAPI.getSupplierScoringData({
      since: oneYearAgo,
      supplierIds,
      supplierNames,
    }),
  ]);
  const {
    incomingStats,
    engineeringStats,
    engineeringStatusStats,
    records: recentQualityRecords,
  } = inspectionScoring;
  const {
    stats: afterSalesStats,
    statusStats: afterSalesStatusStats,
    records: recentAfterSales,
  } = afterSalesScoring;

  incomingStats.forEach((s) => {
    if (!s.supplierName) return;
    const current = statsMap.get(s.supplierName) || createEmptyStats();
    current.count += s._count.id;
    current.quantity += s._sum.quantity || 0;
    if (s.result === 'PASS') {
      current.qualifiedCount += s._count.id;
    } else if (s.result === 'FAIL') {
      current.failures += s._count.id;
      current.failuresQuantity += s._sum.quantity || 0;
    }
    statsMap.set(s.supplierName, current);
  });

  afterSalesStats.forEach((s) => {
    if (!s.supplierBrand) return;
    const current = statsMap.get(s.supplierBrand) || createEmptyStats();
    current.afterSalesLoss +=
      Number(s._sum.materialCost || 0) + Number(s._sum.laborTravelCost || 0);
    current.afterSalesCount += s._count.id;
    statsMap.set(s.supplierBrand, current);
  });

  engineeringStats.forEach((s) => {
    if (!s.supplierName) return;
    const current = statsMap.get(s.supplierName) || createEmptyStats();
    current.engineeringLoss += Number(s._sum.lossAmount || 0);
    current.engineeringCount += s._count.id;
    current.engineeringDefectQuantity += s._sum.quantity || 0;
    statsMap.set(s.supplierName, current);
  });

  engineeringStatusStats.forEach((s) => {
    if (!s.supplierName || s.status === 'CLOSED') return;
    const current = statsMap.get(s.supplierName) || createEmptyStats();
    current.openEngineeringCount += s._count.id;
    statsMap.set(s.supplierName, current);
  });

  afterSalesStatusStats.forEach((s) => {
    if (!s.supplierBrand) return;
    if (
      ['CANCELLED', 'CLOSED', 'COMPLETED', 'RESOLVED'].includes(s.claimStatus)
    ) {
      return;
    }
    const current = statsMap.get(s.supplierBrand) || createEmptyStats();
    current.openAfterSalesCount += s._count.id;
    statsMap.set(s.supplierBrand, current);
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
    const name = r.origin === 'afterSales' ? r.supplierBrand : r.supplierName;
    if (!name) return;

    const loss =
      r.origin === 'afterSales'
        ? Number(r.materialCost || 0) + Number(r.laborTravelCost || 0)
        : Number(r.lossAmount || 0);
    const date =
      r.origin === 'afterSales' ? new Date(r.occurDate) : new Date(r.date);
    const records = supplierRecords.get(name) || [];
    records.push({
      type: classifyDefect(loss, r.severity || undefined),
      loss,
      date,
      origin: r.origin,
    });
    supplierRecords.set(name, records);
  });

  supplierRecords.forEach((records, name) => {
    const current = statsMap.get(name) || createEmptyStats();
    records.sort((a, b) => b.date.getTime() - a.date.getTime());
    statsMap.set(name, applyRecordsToStats(current, records));
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
    incomingQualifiedRate: Number(scored.incomingQualifiedRate || 100),
    incomingScore: Number(scored.incomingScore || 100),
    incomingBatchCount: Number(scored.incomingBatchCount || 0),
    incomingTotalQuantity: Number(scored.incomingTotalQuantity || 0),
    engineeringIssueCount: Number(scored.engineeringIssueCount || 0),
    engineeringScore: Number(scored.engineeringScore || 100),
    afterSalesIssueCount: Number(scored.afterSalesIssueCount || 0),
    afterSalesScore: Number(scored.afterSalesScore || 100),
    totalEngineeringLoss: Number(scored.totalEngineeringLoss || 0),
    totalAfterSalesLoss: Number(scored.totalAfterSalesLoss || 0),
    finalQualityScore: Number(scored.qualityScore || 0),
    finalRating: String(scored.level || scored.rating || 'A'),
    finalStatus: String(scored.status || 'Qualified'),
    isWarning: Boolean(scored.isWarning),
    scoringModel: String(scored.scoringModel || 'SUPPLIER'),
    stabilityScore: Number(scored.stabilityScore || 100),
    warningReasons: scored.warningReasons,
    calculatedAt: new Date(),
    isDeleted: false,
  };
}

async function refreshSupplierChunk(suppliers: SupplierSnapshotInput[]) {
  const supplierNames = uniqueSupplierNames(suppliers.map((item) => item.name));
  const statsMap = await buildSupplierStatsMap(supplierNames);
  await Promise.all(
    suppliers.map((supplier) => {
      const data = toSnapshotData(
        supplier,
        statsMap.get(supplier.name) || createEmptyStats(),
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

  async refreshBySupplierNames(names: string[]) {
    const supplierNames = uniqueSupplierNames(names);
    if (supplierNames.length === 0) return;
    const suppliers = await prisma.suppliers.findMany({
      where: { name: { in: supplierNames }, isDeleted: false },
    });
    return this.refreshSuppliers(suppliers);
  },

  async refreshAll(options: SupplierScoreRefreshOptions = {}) {
    const batchSize = options.batchSize || SUPPLIER_SNAPSHOT_CHUNK_SIZE;
    let batches = 0;
    let cursor: string | undefined;
    let processed = 0;
    for (;;) {
      const suppliers = await prisma.suppliers.findMany({
        where: { isDeleted: false },
        orderBy: { id: 'asc' },
        take: batchSize,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      if (suppliers.length === 0) break;
      const result = await this.refreshSuppliers(suppliers);
      processed += result.processed;
      batches += 1;
      cursor = suppliers.at(-1)?.id;
      if (options.maxBatches && batches >= options.maxBatches) break;
    }
    return { batches, processed };
  },

  async refreshMissing(options: SupplierScoreRefreshOptions = {}) {
    const batchSize = options.batchSize || SUPPLIER_SNAPSHOT_CHUNK_SIZE;
    let batches = 0;
    let processed = 0;
    for (;;) {
      const suppliers = await prisma.suppliers.findMany({
        where: { isDeleted: false, scoreSnapshot: { is: null } },
        orderBy: { id: 'asc' },
        take: batchSize,
      });
      if (suppliers.length === 0) break;
      const result = await this.refreshSuppliers(suppliers);
      processed += result.processed;
      batches += 1;
      if (options.maxBatches && batches >= options.maxBatches) break;
    }
    return { batches, processed };
  },
};
