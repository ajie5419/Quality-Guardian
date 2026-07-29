import type { Prisma } from '@prisma/client';
import type { ResolvedDataScope } from '~/modules/data-scope/data-scope.service';

import { DataScopeService } from '~/modules/data-scope/data-scope.service';
import { InspectionService } from '~/modules/inspection';
import { SupplierIdentityService } from '~/modules/supplier-identity';
import {
  DEFAULT_OUTSOURCING_MODE,
  normalizeOutsourcingMode,
  resolveSupplierInspectionPolicy,
} from '~/modules/supplier/supplier-query';
import prisma from '~/utils/prisma';
import { buildKeywordOr } from '~/utils/query-helpers';

import { SupplierMutationService } from './supplier-mutation.service';

export interface SupplierQueryParams {
  page?: number;
  pageSize?: number;
  category?: string;
  status?: string;
  keyword?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  name?: string;
  outsourcingMode?: string;
  userContext?: { userId: string; username?: string };
  dataScope?: ResolvedDataScope;
}

type SupplierWhereInput = Prisma.suppliersWhereInput;

const SUPPLIER_SORT_FIELDS: Record<
  string,
  Prisma.suppliersOrderByWithRelationInput
> = {
  brand: { brand: 'asc' },
  buyer: { buyer: 'asc' },
  category: { category: 'asc' },
  createdAt: { createdAt: 'asc' },
  email: { email: 'asc' },
  manufacturerNature: { manufacturerNature: 'asc' },
  name: { name: 'asc' },
  phone: { phone: 'asc' },
  productName: { productName: 'asc' },
  recognizedAt: { recognizedAt: 'asc' },
  outsourcingMode: { outsourcingMode: 'asc' },
  updatedAt: { updatedAt: 'asc' },
};

const SUPPLIER_SNAPSHOT_SORT_FIELDS: Record<string, string> = {
  afterSalesIssueCount: 'afterSalesIssueCount',
  engineeringIssueCount: 'engineeringIssueCount',
  incomingQualifiedRate: 'incomingQualifiedRate',
  level: 'finalRating',
  qualityScore: 'finalQualityScore',
  rating: 'finalRating',
  status: 'finalStatus',
};

function buildSupplierOrderBy(
  sortBy?: string,
  sortOrder: 'asc' | 'desc' = 'asc',
): Prisma.suppliersOrderByWithRelationInput[] {
  const snapshotField = sortBy
    ? SUPPLIER_SNAPSHOT_SORT_FIELDS[sortBy]
    : undefined;
  if (snapshotField) {
    return [
      {
        scoreSnapshot: {
          [snapshotField]: sortOrder,
        },
      } as Prisma.suppliersOrderByWithRelationInput,
      { createdAt: 'desc' },
    ];
  }
  const configured = sortBy ? SUPPLIER_SORT_FIELDS[sortBy] : undefined;
  if (!configured) return [{ createdAt: 'desc' }];
  const [field] = Object.keys(configured);
  return [{ [field]: sortOrder }, { createdAt: 'desc' }];
}

function mapSupplierListItem(
  item: Prisma.suppliersGetPayload<{ include: { scoreSnapshot: true } }>,
) {
  const snapshot = item.scoreSnapshot;
  return {
    ...item,
    afterSalesIssueCount: snapshot?.afterSalesIssueCount ?? 0,
    afterSalesScore: snapshot?.afterSalesScore ?? 100,
    engineeringIssueCount: snapshot?.engineeringIssueCount ?? 0,
    engineeringScore: snapshot?.engineeringScore ?? 100,
    incomingBatchCount: snapshot?.incomingBatchCount ?? 0,
    incomingQualifiedRate:
      snapshot && snapshot.incomingBatchCount > 0
        ? snapshot.incomingQualifiedRate
        : null,
    incomingScore: snapshot?.incomingScore ?? 100,
    incomingTotalQuantity: snapshot?.incomingTotalQuantity ?? 0,
    isWarning: snapshot?.isWarning ?? false,
    level: snapshot?.finalRating || item.rating || 'A',
    outsourcingMode: snapshot?.outsourcingMode || item.outsourcingMode,
    qualityScore: snapshot?.finalQualityScore ?? item.qualityScore ?? 100,
    rating: snapshot?.finalRating || item.rating || 'A',
    scoringModel: snapshot?.scoringModel || 'SUPPLIER',
    stabilityScore: snapshot?.stabilityScore ?? 100,
    status: snapshot?.finalStatus || item.status || 'Qualified',
    totalAfterSalesLoss: snapshot?.totalAfterSalesLoss ?? 0,
    totalEngineeringLoss: snapshot?.totalEngineeringLoss ?? 0,
    warningReasons: snapshot?.warningReasons || [],
    createdAt:
      item.createdAt instanceof Date ? item.createdAt.toISOString() : null,
    recognizedAt:
      item.recognizedAt instanceof Date
        ? item.recognizedAt.toISOString()
        : null,
    updatedAt:
      item.updatedAt instanceof Date ? item.updatedAt.toISOString() : null,
  };
}

async function buildSupplierGlobalStats(
  scopedWhere: SupplierWhereInput,
  totalCount: number,
) {
  const [qualifiedCount, warningCount, averageScore] = await Promise.all([
    prisma.suppliers.count({
      where: {
        AND: [
          scopedWhere,
          { scoreSnapshot: { is: { finalStatus: 'Qualified' } } },
        ],
      },
    }),
    prisma.suppliers.count({
      where: {
        AND: [
          scopedWhere,
          {
            OR: [
              { scoreSnapshot: { is: { finalStatus: 'Observation' } } },
              { scoreSnapshot: { is: { finalStatus: 'Frozen' } } },
              { scoreSnapshot: { is: { finalQualityScore: { lt: 80 } } } },
            ],
          },
        ],
      },
    }),
    prisma.supplier_score_snapshots.aggregate({
      where: {
        supplier: { is: scopedWhere },
        isDeleted: false,
      },
      _avg: { finalQualityScore: true },
    }),
  ]);

  return {
    total: totalCount,
    qualified: qualifiedCount,
    warning: warningCount,
    avgScore: (averageScore._avg.finalQualityScore ?? 0).toFixed(1),
  };
}

export const SupplierService = {
  createSupplierWithOutcome: SupplierMutationService.createWithOutcome,

  async createSupplier(payload: Record<string, unknown>) {
    const outcome = await SupplierMutationService.createWithOutcome(payload);
    return outcome?.supplier ?? null;
  },

  updateSupplier: SupplierMutationService.update,

  deleteSupplier: SupplierMutationService.delete,

  batchDeleteSuppliers: SupplierMutationService.batchDelete,

  batchUpsertSuppliers: SupplierMutationService.batchUpsert,

  importSuppliers: SupplierMutationService.import,

  /**
   * Find all suppliers with advanced filtering, scoring, and aggregation
   */
  async findAll(params: SupplierQueryParams) {
    const {
      page = 1,
      pageSize = 20,
      category,
      status,
      keyword,
      sortBy,
      sortOrder,
      outsourcingMode,
    } = params;

    const safePage = Math.max(Number(page) || 1, 1);
    const safePageSize = Math.min(Math.max(Number(pageSize) || 20, 1), 100);
    const skip = (safePage - 1) * safePageSize;

    // 1. 构造极其稳健的过滤条件
    const where: SupplierWhereInput = { isDeleted: false };
    if (category) {
      const cat = category.toLowerCase();
      if (cat === 'supplier' || cat === 'productionunit') {
        where.NOT = { category: { contains: 'Outsourcing' } };
      } else if (cat === 'outsourcing') {
        where.category = { contains: 'Outsourcing' };
      } else {
        where.category = { contains: category };
      }
    }
    if (status) where.status = status;
    const keywordOr = buildKeywordOr(keyword, [
      'name',
      'contact',
      'email',
      'phone',
    ] as const);
    if (keywordOr) Object.assign(where, keywordOr);
    const normalizedOutsourcingMode = normalizeOutsourcingMode(
      outsourcingMode,
      category,
    );
    if (normalizedOutsourcingMode && outsourcingMode) {
      if (normalizedOutsourcingMode === DEFAULT_OUTSOURCING_MODE) {
        where.AND = [
          ...((Array.isArray(where.AND)
            ? where.AND
            : []) as SupplierWhereInput[]),
          {
            OR: [
              { outsourcingMode: normalizedOutsourcingMode },
              { outsourcingMode: null },
            ],
          },
        ];
      } else {
        where.outsourcingMode = normalizedOutsourcingMode;
      }
    }

    const scopedWhere = params.userContext?.userId
      ? await DataScopeService.buildSupplierWhere(
          where,
          {
            userId: params.userContext.userId,
            username: params.userContext.username,
          },
          params.dataScope,
        )
      : where;

    // 2. 执行核心查询
    const [rawItems, totalCount] = await Promise.all([
      prisma.suppliers.findMany({
        where: scopedWhere,
        include: { scoreSnapshot: true },
        orderBy: buildSupplierOrderBy(sortBy, sortOrder),
        skip,
        take: safePageSize,
      }),
      prisma.suppliers.count({ where: scopedWhere }),
    ]);

    const globalStats = await buildSupplierGlobalStats(scopedWhere, totalCount);

    return {
      items: rawItems.map((item) => mapSupplierListItem(item)),
      total: totalCount,
      stats: globalStats,
    };
  },

  async getHistoryProjects(
    id: string,
    params: { page?: number; pageSize?: number } = {},
  ) {
    const supplier = await prisma.suppliers.findFirst({
      select: {
        category: true,
        id: true,
        outsourcingMode: true,
      },
      where: { id, isDeleted: false },
    });
    if (!supplier) return null;

    const policy = resolveSupplierInspectionPolicy(supplier);
    const teamIds =
      policy.identitySource === 'team'
        ? await SupplierIdentityService.teamIdsForSupplier(supplier.id)
        : [];
    return InspectionService.getSupplierHistoryProjects({
      identitySource: policy.identitySource,
      page: params.page,
      pageSize: params.pageSize,
      supplierId: supplier.id,
      teamIds,
    });
  },

  async getInspectionHistory(
    id: string,
    params: { page?: number; pageSize?: number } = {},
  ) {
    const supplier = await prisma.suppliers.findFirst({
      select: {
        category: true,
        id: true,
        name: true,
        outsourcingMode: true,
      },
      where: { id, isDeleted: false },
    });
    if (!supplier) return null;

    const policy = resolveSupplierInspectionPolicy(supplier);
    const teamIds =
      policy.identitySource === 'team'
        ? await SupplierIdentityService.teamIdsForSupplier(supplier.id)
        : [];
    const history = await InspectionService.findSupplierHistory({
      category: policy.inspectionCategory,
      identitySource: policy.identitySource,
      page: params.page,
      pageSize: params.pageSize,
      supplierId: supplier.id,
      teamIds,
    });
    return {
      ...history,
      source: policy.inspectionCategory,
    };
  },

  async getQualityIssues(
    id: string,
    params: { page?: number; pageSize?: number } = {},
  ) {
    const supplier = await prisma.suppliers.findFirst({
      select: { id: true },
      where: { id, isDeleted: false },
    });
    if (!supplier) return null;

    return InspectionService.findSupplierIssues({
      page: params.page,
      pageSize: params.pageSize,
      supplierId: supplier.id,
    });
  },
};
