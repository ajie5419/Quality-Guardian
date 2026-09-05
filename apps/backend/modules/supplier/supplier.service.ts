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
import { EXPORT_QUERY_TAKE } from '~/utils/export-constants';
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

async function buildSupplierScopedWhere(params: {
  category?: string;
  dataScope?: ResolvedDataScope;
  keyword?: string;
  outsourcingMode?: string;
  status?: string;
  userContext?: { userId: string; username?: string };
}): Promise<SupplierWhereInput> {
  const { category, status, keyword, outsourcingMode } = params;
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

  return params.userContext?.userId
    ? DataScopeService.buildSupplierWhere(
        where,
        {
          userId: params.userContext.userId,
          username: params.userContext.username,
        },
        params.dataScope,
      )
    : where;
}

export const SupplierService = {
  async listActiveOptions(options: { category: string; keyword?: string }) {
    const keyword = String(options.keyword || '').trim();
    const suppliers = await prisma.suppliers.findMany({
      where: {
        category: options.category,
        isDeleted: false,
        ...(keyword ? { name: { contains: keyword } } : {}),
      },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
      take: 100,
    });
    return suppliers.map((supplier) => ({
      label: supplier.name,
      value: supplier.id,
    }));
  },

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
    const { page = 1, pageSize = 20, sortBy, sortOrder } = params;

    const safePage = Math.max(Number(page) || 1, 1);
    const safePageSize = Math.min(Math.max(Number(pageSize) || 20, 1), 100);
    const skip = (safePage - 1) * safePageSize;

    const scopedWhere = await buildSupplierScopedWhere(params);

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

  /**
   * Bounded export read (PERF-QMS-001 / PHASE-1A): same filters and DataScope
   * as the interactive list but reads at most EXPORT_QUERY_TAKE rows and never
   * goes through the interactive page-size cap (100).
   */
  async findAllForExport(
    params: Omit<SupplierQueryParams, 'page' | 'pageSize'>,
  ) {
    const { sortBy, sortOrder } = params;
    const scopedWhere = await buildSupplierScopedWhere(params);
    const [rawItems, totalCount] = await Promise.all([
      prisma.suppliers.findMany({
        where: scopedWhere,
        include: { scoreSnapshot: true },
        orderBy: buildSupplierOrderBy(sortBy, sortOrder),
        take: EXPORT_QUERY_TAKE,
      }),
      prisma.suppliers.count({ where: scopedWhere }),
    ]);
    return {
      items: rawItems.map((item) => mapSupplierListItem(item)),
      total: totalCount,
    };
  },

  async getHistoryProjects(
    id: string,
    params: { page?: number; pageSize?: number } = {},
    access?: {
      scope?: { deptIds?: string[]; scopeType?: 'ALL' | 'DEPT' | 'SELF' };
      user?: { id?: number | string; username?: string };
    },
  ) {
    const userContext = access?.user
      ? {
          userId: String(access.user.id ?? ''),
          username: access.user.username,
        }
      : undefined;
    const supplierWhere = userContext?.userId
      ? await DataScopeService.buildSupplierWhere(
          { id, isDeleted: false },
          userContext,
          access?.scope,
        )
      : { id, isDeleted: false };
    const supplier = await prisma.suppliers.findFirst({
      select: {
        category: true,
        id: true,
        outsourcingMode: true,
      },
      where: supplierWhere,
    });
    if (!supplier) return null;

    const policy = resolveSupplierInspectionPolicy(supplier);
    const teamIds =
      policy.identitySource === 'team'
        ? await SupplierIdentityService.teamIdsForSupplier(supplier.id)
        : [];
    return InspectionService.getSupplierHistoryProjects({
      dataScope: access?.scope,
      identitySource: policy.identitySource,
      page: params.page,
      pageSize: params.pageSize,
      supplierId: supplier.id,
      teamIds,
      userContext,
    });
  },

  async getInspectionHistory(
    id: string,
    params: { page?: number; pageSize?: number } = {},
    access?: {
      scope?: { deptIds?: string[]; scopeType?: 'ALL' | 'DEPT' | 'SELF' };
      user?: { id?: number | string; username?: string };
    },
  ) {
    const userContext = access?.user
      ? {
          userId: String(access.user.id ?? ''),
          username: access.user.username,
        }
      : undefined;
    const supplierWhere = userContext?.userId
      ? await DataScopeService.buildSupplierWhere(
          { id, isDeleted: false },
          userContext,
          access?.scope,
        )
      : { id, isDeleted: false };
    const supplier = await prisma.suppliers.findFirst({
      select: {
        category: true,
        id: true,
        name: true,
        outsourcingMode: true,
      },
      where: supplierWhere,
    });
    if (!supplier) return null;

    const policy = resolveSupplierInspectionPolicy(supplier);
    const teamIds =
      policy.identitySource === 'team'
        ? await SupplierIdentityService.teamIdsForSupplier(supplier.id)
        : [];
    const history = await InspectionService.findSupplierHistory({
      category: policy.inspectionCategory,
      dataScope: access?.scope,
      identitySource: policy.identitySource,
      page: params.page,
      pageSize: params.pageSize,
      supplierId: supplier.id,
      teamIds,
      userContext,
    });
    return {
      ...history,
      source: policy.inspectionCategory,
    };
  },

  async getQualityIssues(
    id: string,
    params: { page?: number; pageSize?: number } = {},
    access?: {
      scope?: { deptIds?: string[]; scopeType?: 'ALL' | 'DEPT' | 'SELF' };
      user?: { id?: number | string; username?: string };
    },
  ) {
    const userContext = access?.user
      ? {
          userId: String(access.user.id ?? ''),
          username: access.user.username,
        }
      : undefined;
    const supplierWhere = userContext?.userId
      ? await DataScopeService.buildSupplierWhere(
          { id, isDeleted: false },
          userContext,
          access?.scope,
        )
      : { id, isDeleted: false };
    const supplier = await prisma.suppliers.findFirst({
      select: { id: true },
      where: supplierWhere,
    });
    if (!supplier) return null;

    return InspectionService.findSupplierIssues({
      dataScope: access?.scope,
      page: params.page,
      pageSize: params.pageSize,
      supplierId: supplier.id,
      userContext,
    });
  },
};
