import type {
  AfterSalesItem,
  AfterSalesParams,
  AfterSalesStats,
} from '@qgs/shared';
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
import { FileStorageService } from '~/modules/file-storage/file-storage.service';
import { SystemLogService } from '~/modules/system-log/system-log.service';
import { parseResponsibleDepartments } from '~/utils/department-multi';
import prisma from '~/utils/prisma';

import { AfterSalesAnalyticsService } from './after-sales-analytics.service';
import { AfterSalesIntegrationService } from './after-sales-integration.service';
import { buildGovernedAfterSalesUpdateData } from './after-sales-payload';
import { buildAfterSalesDateRange } from './after-sales-query';
import { normalizeAfterSalesClaimStatus } from './after-sales-status';

function getResponsibleDepartmentsForResponse(item: {
  respDept: null | string;
  responsibleDepartments: null | string;
}): string[] {
  const responsibleDepartments = parseResponsibleDepartments(
    item.responsibleDepartments,
  );
  if (responsibleDepartments.length > 0) {
    return responsibleDepartments;
  }
  return item.respDept ? [item.respDept] : [];
}

async function refreshSupplierScoreSnapshots(names: unknown[]) {
  const supplierNames = names
    .map((name) => String(name || '').trim())
    .filter(Boolean);
  if (supplierNames.length === 0) return;
  const { SupplierScoreSnapshotService } = await import('~/modules/supplier');
  await SupplierScoreSnapshotService.refreshBySupplierNames(supplierNames);
}

export const AfterSalesService = {
  async findIdBySerialNumber(serialNumber: number) {
    return AfterSalesIntegrationService.findIdBySerialNumber(serialNumber);
  },

  async updateQualityLossFields(params: { actualClaim?: number; id: string }) {
    return AfterSalesIntegrationService.updateQualityLossFields(params);
  },

  async getQualityLossTrendRows(params: {
    granularity: 'month' | 'week';
    year: number;
  }) {
    return AfterSalesIntegrationService.getQualityLossTrendRows(params);
  },

  async getLossRecordsForAggregation(params?: {
    skip?: number;
    take?: number;
    workOrderNumber?: string;
  }) {
    return AfterSalesIntegrationService.getLossRecordsForAggregation(params);
  },

  async countLossRecordsForAggregation(params?: { workOrderNumber?: string }) {
    return AfterSalesIntegrationService.countLossRecordsForAggregation(params);
  },

  async getQualityLossDrillDownRecords(params: {
    end: Date;
    start: Date;
    take?: number;
  }) {
    return AfterSalesIntegrationService.getQualityLossDrillDownRecords(params);
  },

  async getSupplierScoringData(params: {
    since: Date;
    supplierNames: string[];
  }) {
    return AfterSalesIntegrationService.getSupplierScoringData(params);
  },

  async getWeeklyReportIssues(params: { end: Date; start: Date }) {
    return AfterSalesIntegrationService.getWeeklyReportIssues(params);
  },

  async getVehicleFailureRecords(params: {
    end: Date;
    productType: string;
    start: Date;
    vehicleDeptIds: string[];
  }) {
    return AfterSalesIntegrationService.getVehicleFailureRecords(params);
  },

  async findEarliestVehicleFailureDate(params: {
    end: Date;
    productType: string;
    vehicleDeptIds: string[];
  }) {
    return AfterSalesIntegrationService.findEarliestVehicleFailureDate(params);
  },

  async getReportPeriodMetrics(params: { end: Date; start: Date }) {
    return AfterSalesIntegrationService.getReportPeriodMetrics(params);
  },

  async getStatsForDashboard(params: { weekStart: Date; yearStart: Date }) {
    return AfterSalesIntegrationService.getStatsForDashboard(params);
  },

  async updateByRoute(
    id: string,
    bodyRecord: Record<string, unknown>,
  ): Promise<void> {
    const { costsChanged, data: updateData } =
      await buildGovernedAfterSalesUpdateData(bodyRecord);
    const supplierChanged = updateData.supplierBrand !== undefined;
    let previousSupplierBrand: null | string | undefined;

    if (costsChanged || supplierChanged) {
      const current = await prisma.after_sales.findUnique({
        where: { id },
        select: {
          laborTravelCost: true,
          materialCost: true,
          supplierBrand: true,
        },
      });
      if (costsChanged && !current) {
        throw new Error('AFTER_SALES_NOT_FOUND');
      }
      previousSupplierBrand = current?.supplierBrand;

      if (costsChanged) {
        const materialCost = Number(
          updateData.materialCost ?? current?.materialCost ?? 0,
        );
        const laborTravelCost = Number(
          updateData.laborTravelCost ?? current?.laborTravelCost ?? 0,
        );
        updateData.qualityLoss = materialCost + laborTravelCost;
      }
    }

    await prisma.after_sales.update({
      where: { id },
      data: updateData,
    });
    await refreshSupplierScoreSnapshots([
      previousSupplierBrand,
      updateData.supplierBrand,
    ]);
  },

  /**
   * Calculate After-Sales KPI and Statistics
   */
  async getStats(params?: {
    dateMode?: AfterSalesDateMode;
    dateValue?: string;
    year?: number;
  }): Promise<AfterSalesStats> {
    return AfterSalesAnalyticsService.getStats(params);
  },

  async getChartAggregation(params: {
    dataScope?: ResolvedDataScope;
    dateMode?: AfterSalesDateMode;
    dateValue?: string;
    dimension: AfterSalesChartDimension;
    metric: AfterSalesChartMetric;
    top?: number;
    userContext?: { userId: string; username?: string };
    year?: number;
  }): Promise<AfterSalesChartAggregateItem[]> {
    return AfterSalesAnalyticsService.getChartAggregation(params);
  },

  /**
   * Get List of After-Sales Records with filtering
   */
  async getList(
    params: AfterSalesParams & {
      dataScope?: ResolvedDataScope;
      dateMode?: AfterSalesDateMode;
      dateValue?: string;
      userContext?: { userId: string; username?: string };
    },
  ): Promise<AfterSalesItem[]> {
    const {
      dateMode,
      dateValue,
      projectName,
      status,
      supplierBrand,
      workOrderNumber,
      year,
    } = params;

    let where: Prisma.after_salesWhereInput = {
      isDeleted: false,
    };

    // Date Logic
    const hasCustomRange = dateMode === 'month' || dateMode === 'week';
    if (year || hasCustomRange) {
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
    if (status && String(status).trim() !== '') {
      const claimStatus = normalizeAfterSalesClaimStatus(status);
      if (claimStatus) {
        where.claimStatus = claimStatus;
      }
    }
    if (supplierBrand && String(supplierBrand).trim() !== '') {
      where.OR = [
        { supplierBrand: { contains: String(supplierBrand).trim() } },
        { projectName: { contains: String(supplierBrand).trim() } },
      ];
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

    const list = await prisma.after_sales.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    // Map to frontend expectation with formatted dates
    return list.map((item) => {
      const materialCost = Number(item.materialCost) || 0;
      const laborTravelCost = Number(item.laborTravelCost) || 0;
      const responsibleDepartments = getResponsibleDepartmentsForResponse(item);

      return {
        ...item,
        issueDate: formatDate(item.occurDate),
        occurDate: formatDate(item.occurDate),
        factoryDate: formatDate(item.factoryDate),
        closeDate: formatDate(item.closeDate),
        shipDate: formatDate(item.shipDate),
        createdAt: formatDate(item.createdAt),
        responsibleDept: item.respDept || '',
        responsibleDepartments,
        resolutionPlan: item.solution || '',
        status: item.claimStatus,
        isClaim: item.isClaim || false,
        materialCost,
        laborTravelCost,
        qualityLoss: materialCost + laborTravelCost,
        photos: tryParsePhotos(item.photos as string),
        productType: item.productType || '',
        productSubtype: item.productSubtype || '',
        division: item.division || '',
        partName: item.partName || '',
        supplierBrand: item.supplierBrand || '',
        runningHours: Number(item.runningHours) || 0,
      } as AfterSalesItem;
    });
  },

  /**
   * Soft delete a record with audit logging
   */
  async deleteRecord(id: string, userId: string): Promise<void> {
    await prisma.after_sales.update({
      where: { id },
      data: {
        isDeleted: true,
        updatedAt: new Date(),
      },
    });

    await FileStorageService.softDeleteReferences({
      bizId: id,
      bizType: 'after_sales',
    });

    // Record audit log
    await SystemLogService.auditLog('after-sales', 'delete', {
      userId,
      targetId: id,
      detailsVariables: {},
    });
  },
};
