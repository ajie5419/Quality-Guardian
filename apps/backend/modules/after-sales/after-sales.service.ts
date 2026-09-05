import type {
  AfterSalesItem,
  AfterSalesParams,
  AfterSalesStats,
} from '@qgs/shared';
import type { AccessScope, AnalyticsAccessContext } from '~/modules/data-scope';
import type { ResolvedDataScope } from '~/modules/data-scope/data-scope.service';

import type {
  AfterSalesChartAggregateItem,
  AfterSalesChartDimension,
  AfterSalesChartMetric,
} from './after-sales-analytics.service';
import type { AfterSalesDateMode } from './after-sales-query';

import { Prisma } from '@prisma/client';
import { formatDate, tryParsePhotos } from '@qgs/shared';
import { DataScopeService } from '~/modules/data-scope/data-scope.service';
import { DeptService } from '~/modules/dept';
import { MetricRefreshQueue } from '~/modules/metric-refresh';
import { QualityLossIndexQueue } from '~/modules/quality-loss';
import { resolveCanonicalClassificationName } from '~/utils/classification-resolver';
import { INTERACTIVE_PAGE_SIZE_MAX } from '~/utils/export-constants';
import prisma from '~/utils/prisma';

import { AfterSalesAnalyticsService } from './after-sales-analytics.service';
import { deleteAfterSalesRecord } from './after-sales-delete.service';
import { AfterSalesIntegrationService } from './after-sales-integration.service';
import {
  AFTER_SALES_LIST_SELECT,
  getResponsibleDepartmentsForResponse,
} from './after-sales-list-dto';
import { buildGovernedAfterSalesUpdateData } from './after-sales-payload';
import {
  buildAfterSalesDateRange,
  buildAfterSalesExplicitDateRange,
} from './after-sales-query';
import { normalizeAfterSalesClaimStatus } from './after-sales-status';

function appendAndCondition(
  where: Prisma.after_salesWhereInput,
  condition: Prisma.after_salesWhereInput,
) {
  const existing = where.AND;
  if (Array.isArray(existing)) {
    where.AND = [...existing, condition];
    return;
  }
  where.AND = existing ? [existing, condition] : [condition];
}

export const AfterSalesService = {
  async findIdBySerialNumber(serialNumber: number) {
    return AfterSalesIntegrationService.findIdBySerialNumber(serialNumber);
  },

  async updateQualityLossFields(params: { actualClaim?: number; id: string }) {
    return AfterSalesIntegrationService.updateQualityLossFields(params);
  },

  async getSupplierScoringData(params: { since: Date; supplierIds: string[] }) {
    return AfterSalesIntegrationService.getSupplierScoringData(params);
  },

  async getWeeklyReportIssues(
    params: { end: Date; start: Date },
    access: AnalyticsAccessContext,
  ) {
    return AfterSalesIntegrationService.getWeeklyReportIssues(params, access);
  },

  async getVehicleFailureRecords(params: {
    end: Date;
    productCategoryId: null | string;
    productTypeSnapshots: string[];
    start: Date;
    vehicleDeptIds: string[];
  }) {
    return AfterSalesIntegrationService.getVehicleFailureRecords(params);
  },

  async findEarliestVehicleFailureDate(params: {
    end: Date;
    productCategoryId: null | string;
    productTypeSnapshots: string[];
    vehicleDeptIds: string[];
  }) {
    return AfterSalesIntegrationService.findEarliestVehicleFailureDate(params);
  },

  async getReportPeriodMetrics(
    params: { end: Date; start: Date },
    access: AnalyticsAccessContext,
  ) {
    return AfterSalesIntegrationService.getReportPeriodMetrics(params, access);
  },

  async getStatsForDashboard(
    params: { weekStart: Date; yearStart: Date },
    access: AnalyticsAccessContext,
  ) {
    return AfterSalesIntegrationService.getStatsForDashboard(params, access);
  },

  async updateByRoute(
    id: string,
    bodyRecord: Record<string, unknown>,
  ): Promise<void> {
    const { costsChanged, data: updateData } =
      await buildGovernedAfterSalesUpdateData(bodyRecord);
    const supplierChanged =
      updateData.supplierBrand !== undefined ||
      updateData.supplierBrandId !== undefined;
    await prisma.$transaction(async (tx) => {
      const current =
        costsChanged || supplierChanged
          ? await tx.after_sales.findUnique({
              where: { id },
              select: {
                laborTravelCost: true,
                materialCost: true,
                supplierBrandId: true,
              },
            })
          : null;
      if (costsChanged && !current) {
        throw new Error('AFTER_SALES_NOT_FOUND');
      }
      // qms-arch-allow R-SCOPE: legacy after-sales update path (b168); the id
      // is the endpoint id param and current callers are tests only. Migrate
      // to updateAccessible in the dedicated after-sales write special.
      const updated = await tx.after_sales.update({
        where: { id },
        data: updateData,
      });
      await MetricRefreshQueue.enqueueSupplierScores(
        tx,
        [current?.supplierBrandId, updated.supplierBrandId],
        'after-sales.updated',
      );
      await QualityLossIndexQueue.enqueue(
        tx,
        [{ source: 'EXTERNAL', sourcePk: updated.id }],
        'after-sales.updated',
      );
    });
  },

  /**
   * Calculate After-Sales KPI and Statistics
   */
  async getStats(
    params?: {
      dateMode?: AfterSalesDateMode;
      dateValue?: string;
      year?: number;
    },
    access?: AnalyticsAccessContext,
  ): Promise<AfterSalesStats> {
    return AfterSalesAnalyticsService.getStats(params, access);
  },

  async getChartAggregation(
    params: {
      dateMode?: AfterSalesDateMode;
      dateValue?: string;
      dimension: AfterSalesChartDimension;
      metric: AfterSalesChartMetric;
      top?: number;
      year?: number;
    },
    access?: AnalyticsAccessContext,
  ): Promise<AfterSalesChartAggregateItem[]> {
    return AfterSalesAnalyticsService.getChartAggregation(params, access);
  },

  /**
   * Get List of After-Sales Records with filtering
   */
  async getList(
    params: AfterSalesParams & {
      dataScope?: ResolvedDataScope;
      dateMode?: AfterSalesDateMode;
      dateValue?: string;
      page?: number;
      pageSize?: number;
      userContext?: { userId: string; username?: string };
    },
  ): Promise<{ items: AfterSalesItem[]; total: number }> {
    const {
      dateMode,
      dateValue,
      defectCategoryId,
      defectSubcategoryId,
      defectType,
      endDate,
      handler,
      partName,
      page,
      pageSize,
      projectName,
      productCategoryId,
      productSubcategoryId,
      productType,
      responsibleDept,
      status,
      supplierBrand,
      supplierBrandId,
      startDate,
      customerName,
      workOrderNumber,
      year,
    } = params;

    let where: Prisma.after_salesWhereInput = {
      isDeleted: false,
    };

    // Date Logic
    const explicitDateRange = buildAfterSalesExplicitDateRange({
      endDate,
      startDate,
    });
    const hasCustomRange = dateMode === 'month' || dateMode === 'week';
    if (explicitDateRange) {
      where.occurDate = {
        gte: explicitDateRange.start,
        lt: explicitDateRange.end,
      };
    } else if (year || hasCustomRange) {
      const { start, end } = buildAfterSalesDateRange({
        dateMode,
        dateValue,
        year,
      });
      where.occurDate = {
        gte: start,
        lt: end,
      };
    }

    if (workOrderNumber && String(workOrderNumber).trim() !== '') {
      where.workOrderNumber = {
        contains: String(workOrderNumber).trim(),
      };
    }
    if (projectName && String(projectName).trim() !== '') {
      where.projectName = { contains: String(projectName).trim() };
    }
    if (customerName && String(customerName).trim() !== '') {
      where.customerName = { contains: String(customerName).trim() };
    }
    if (partName && String(partName).trim() !== '') {
      where.partName = { contains: String(partName).trim() };
    }
    if (handler && String(handler).trim() !== '') {
      where.handler = { contains: String(handler).trim() };
    }
    if (productCategoryId && String(productCategoryId).trim() !== '') {
      where.productCategoryId = String(productCategoryId).trim();
    } else if (productType && String(productType).trim() !== '') {
      const searchTerm = String(productType).trim();
      appendAndCondition(where, {
        OR: [
          { productType: { contains: searchTerm } },
          { productCategory: { is: { name: { contains: searchTerm } } } },
        ],
      });
    }
    if (productSubcategoryId && String(productSubcategoryId).trim() !== '') {
      where.productSubcategoryId = String(productSubcategoryId).trim();
    }
    if (defectCategoryId && String(defectCategoryId).trim() !== '') {
      where.defectCategoryId = String(defectCategoryId).trim();
    } else if (defectType && String(defectType).trim() !== '') {
      const searchTerm = String(defectType).trim();
      appendAndCondition(where, {
        OR: [
          { defectType: { contains: searchTerm } },
          { defectCategory: { is: { name: { contains: searchTerm } } } },
        ],
      });
    }
    if (defectSubcategoryId && String(defectSubcategoryId).trim() !== '') {
      where.defectSubcategoryId = String(defectSubcategoryId).trim();
    }
    if (responsibleDept && String(responsibleDept).trim() !== '') {
      const searchTerm = String(responsibleDept).trim();
      const currentDepartments =
        await DeptService.findActiveByNameContains(searchTerm);
      appendAndCondition(where, {
        OR: [
          { respDept: { contains: searchTerm } },
          { respDeptId: { contains: searchTerm } },
          { responsibleDepartments: { contains: searchTerm } },
          ...(currentDepartments.length > 0
            ? [
                {
                  respDeptId: {
                    in: currentDepartments.map((department) => department.id),
                  },
                },
              ]
            : []),
        ],
      });
    }
    if (status && String(status).trim() !== '') {
      const claimStatus = normalizeAfterSalesClaimStatus(status);
      if (claimStatus) {
        where.claimStatus = claimStatus;
      }
    }
    if (supplierBrandId && String(supplierBrandId).trim() !== '') {
      where.supplierBrandId = String(supplierBrandId).trim();
    } else if (supplierBrand && String(supplierBrand).trim() !== '') {
      const searchTerm = String(supplierBrand).trim();
      appendAndCondition(where, {
        OR: [
          { supplierBrand: { contains: searchTerm } },
          { projectName: { contains: searchTerm } },
        ],
      });
    }

    if (params.userContext?.userId) {
      where = await DataScopeService.buildAfterSalesWhere(
        where,
        {
          userId: params.userContext.userId,
          username: params.userContext.username,
        },
        params.dataScope,
      );
    }

    const safePage = Math.max(Number(page) || 1, 1);
    const safePageSize = Math.min(
      Math.max(Number(pageSize) || 20, 1),
      INTERACTIVE_PAGE_SIZE_MAX,
    );
    const skip = (safePage - 1) * safePageSize;

    // Server-side pagination (PERF-QMS-001 / PHASE-1A): the same scoped where
    // drives both the page and the count, so the page, the total and the
    // DataScope contract can never drift.
    const [list, total] = await Promise.all([
      prisma.after_sales.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: AFTER_SALES_LIST_SELECT,
        skip,
        take: safePageSize,
      }),
      prisma.after_sales.count({ where }),
    ]);
    const departmentNames = await DeptService.resolveActiveNamesByIds(
      list.map((item) => item.respDeptId),
    );

    // Map to frontend expectation with formatted dates
    const items = list.map((item) => {
      const materialCost = Number(item.materialCost) || 0;
      const laborTravelCost = Number(item.laborTravelCost) || 0;
      const currentResponsibleDepartmentName = departmentNames.get(
        item.respDeptId || '',
      );
      const responsibleDepartments = getResponsibleDepartmentsForResponse(
        item,
        currentResponsibleDepartmentName,
      );

      return {
        ...item,
        issueDate: formatDate(item.occurDate),
        occurDate: formatDate(item.occurDate),
        factoryDate: formatDate(item.factoryDate),
        closeDate: formatDate(item.closeDate),
        shipDate: formatDate(item.shipDate),
        createdAt: formatDate(item.createdAt),
        responsibleDept:
          currentResponsibleDepartmentName || item.respDept || '',
        responsibleDepartments,
        resolutionPlan: item.solution || '',
        status: item.claimStatus,
        isClaim: item.isClaim || false,
        materialCost,
        laborTravelCost,
        qualityLoss: materialCost + laborTravelCost,
        photos: tryParsePhotos(item.photos as string),
        defectCategoryId: item.defectCategoryId || undefined,
        defectSubcategoryId: item.defectSubcategoryId || undefined,
        defectType:
          resolveCanonicalClassificationName(
            item.defectCategory?.name,
            item.defectType,
          ) || '',
        defectSubtype:
          resolveCanonicalClassificationName(
            item.defectSubcategory?.name,
            item.defectSubtype,
          ) || '',
        productType:
          resolveCanonicalClassificationName(
            item.productCategory?.name,
            item.productType,
          ) || '',
        productSubtype:
          resolveCanonicalClassificationName(
            item.productSubcategory?.name,
            item.productSubtype,
          ) || '',
        productCategoryId: item.productCategoryId || undefined,
        productSubcategoryId: item.productSubcategoryId || undefined,
        division: item.division || '',
        partName: item.partName || '',
        supplierBrand: item.supplierBrand || '',
        runningHours: Number(item.runningHours) || 0,
      } as AfterSalesItem;
    });

    return { items, total };
  },

  /**
   * Soft delete a record with audit logging
   */
  async deleteRecord(
    id: string,
    userId: string,
    scope?: AccessScope,
    expectedVersion?: number,
  ): Promise<void> {
    return deleteAfterSalesRecord(id, userId, scope, expectedVersion);
  },
};
