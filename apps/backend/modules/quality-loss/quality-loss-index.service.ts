import type { Prisma } from '@prisma/client';

import { createModuleLogger } from '~/utils/logger';
import prisma from '~/utils/prisma';

const logger = createModuleLogger('QualityLossIndexService');

const SOURCE = {
  COMMISSIONING: 'Commissioning',
  EXTERNAL: 'External',
  INTERNAL: 'Internal',
  MANUAL: 'Manual',
} as const;

type IndexRow = Prisma.quality_loss_indexUncheckedCreateInput;
type Source = (typeof SOURCE)[keyof typeof SOURCE];

interface AfterSalesInput {
  actualClaim?: null | number | Prisma.Decimal;
  claimStatus: null | string;
  createdBy: null | string;
  id: string;
  isClaim?: boolean;
  isDeleted: boolean;
  laborTravelCost?: null | number | Prisma.Decimal;
  materialCost?: null | number | Prisma.Decimal;
  occurDate: Date;
  projectName: null | string;
  respDept: null | string;
  supplierBrandId?: null | string;
  workOrderNumber: null | string;
}

interface InternalInput {
  createdBy: null | string;
  date: Date;
  id: string;
  isDeleted: boolean;
  lossAmount?: null | number | Prisma.Decimal;
  projectName: null | string;
  recoveredAmount?: null | number | Prisma.Decimal;
  responsibleDepartment: null | string;
  status: null | string;
  workOrderNumber: null | string;
}

interface CommissioningInput {
  claimStatus: null | string;
  createdBy: null | string;
  date: Date;
  id: string;
  isClaim?: boolean;
  isDeleted: boolean;
  lossAmount?: null | number | Prisma.Decimal;
  projectName: null | string;
  recoveredAmount?: null | number | Prisma.Decimal;
  responsibleDepartment: null | string;
  workOrderNumber: null | string;
}

interface ManualInput {
  actualClaim?: null | number | Prisma.Decimal;
  amount: null | number | Prisma.Decimal;
  createdBy: null | string;
  id: string;
  isDeleted: boolean;
  occurDate: Date;
  respDept: null | string;
  status: null | string;
}

function num(value: null | number | Prisma.Decimal | undefined) {
  return value === null || value === undefined ? 0 : Number(value);
}

async function upsertIndexRow(row: IndexRow) {
  try {
    await prisma.quality_loss_index.upsert({
      where: {
        source_sourcePk: { source: row.source, sourcePk: row.sourcePk },
      },
      create: row,
      update: row,
    });
  } catch (error) {
    logger.warn(
      { err: error, source: row.source, sourcePk: row.sourcePk },
      'failed to upsert quality_loss_index row',
    );
  }
}

async function softDelete(source: Source, sourcePk: string) {
  try {
    await prisma.quality_loss_index.updateMany({
      where: { source, sourcePk },
      data: { isDeleted: true, indexedAt: new Date() },
    });
  } catch (error) {
    logger.warn(
      { err: error, source, sourcePk },
      'failed to soft-delete quality_loss_index row',
    );
  }
}

export const QualityLossIndexService = {
  async upsertFromAfterSales(row: AfterSalesInput | null | undefined) {
    if (!row) return;
    const amount = num(row.materialCost) + num(row.laborTravelCost);
    const include = !row.isDeleted && (row.isClaim || amount > 0);
    if (!include) {
      await softDelete(SOURCE.EXTERNAL, row.id);
      return;
    }
    await upsertIndexRow({
      id: `EXT-${row.id}`,
      source: SOURCE.EXTERNAL,
      sourcePk: row.id,
      occurDate: row.occurDate,
      amount,
      actualClaim: num(row.actualClaim),
      status: row.claimStatus || 'OPEN',
      projectName: row.projectName,
      workOrderNumber: row.workOrderNumber,
      respDept: row.respDept,
      supplierBrandId: row.supplierBrandId ?? null,
      createdBy: row.createdBy,
      isDeleted: false,
      indexedAt: new Date(),
    });
  },

  async upsertFromInternal(row: InternalInput | null | undefined) {
    if (!row) return;
    const amount = num(row.lossAmount);
    if (row.isDeleted || amount <= 0) {
      await softDelete(SOURCE.INTERNAL, row.id);
      return;
    }
    await upsertIndexRow({
      id: `INT-${row.id}`,
      source: SOURCE.INTERNAL,
      sourcePk: row.id,
      occurDate: row.date,
      amount,
      actualClaim: num(row.recoveredAmount),
      status: row.status || 'OPEN',
      projectName: row.projectName,
      workOrderNumber: row.workOrderNumber,
      respDept: row.responsibleDepartment,
      supplierBrandId: null,
      createdBy: row.createdBy,
      isDeleted: false,
      indexedAt: new Date(),
    });
  },

  async upsertFromCommissioning(row: CommissioningInput | null | undefined) {
    if (!row) return;
    const amount = num(row.lossAmount);
    const include = !row.isDeleted && (row.isClaim || amount > 0);
    if (!include) {
      await softDelete(SOURCE.COMMISSIONING, row.id);
      return;
    }
    await upsertIndexRow({
      id: `DA-${row.id}`,
      source: SOURCE.COMMISSIONING,
      sourcePk: row.id,
      occurDate: row.date,
      amount,
      actualClaim: num(row.recoveredAmount),
      status: row.claimStatus || 'OPEN',
      projectName: row.projectName,
      workOrderNumber: row.workOrderNumber,
      respDept: row.responsibleDepartment,
      supplierBrandId: null,
      createdBy: row.createdBy,
      isDeleted: false,
      indexedAt: new Date(),
    });
  },

  async upsertFromManual(row: ManualInput | null | undefined) {
    if (!row) return;
    const amount = num(row.amount);
    if (row.isDeleted || amount <= 0) {
      await softDelete(SOURCE.MANUAL, row.id);
      return;
    }
    await upsertIndexRow({
      id: `QL-${row.id}`,
      source: SOURCE.MANUAL,
      sourcePk: row.id,
      occurDate: row.occurDate,
      amount,
      actualClaim: num(row.actualClaim),
      status: row.status || 'Pending',
      projectName: null,
      workOrderNumber: null,
      respDept: row.respDept,
      supplierBrandId: null,
      createdBy: row.createdBy,
      isDeleted: false,
      indexedAt: new Date(),
    });
  },

  async softDeleteSource(source: Source, sourcePk: string) {
    await softDelete(source, sourcePk);
  },

  async softDeleteSourceMany(source: Source, sourcePks: string[]) {
    if (sourcePks.length === 0) return;
    try {
      await prisma.quality_loss_index.updateMany({
        where: { source, sourcePk: { in: sourcePks } },
        data: { isDeleted: true, indexedAt: new Date() },
      });
    } catch (error) {
      logger.warn(
        { err: error, source, count: sourcePks.length },
        'failed to soft-delete quality_loss_index rows',
      );
    }
  },
};
