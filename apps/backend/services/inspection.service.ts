import type { inspection_result } from '@prisma/client';
import type { InspectionIssue, InspectionIssueStatusEnum } from '@qgs/shared';

import { Prisma } from '@prisma/client';
import { formatDate, tryParsePhotos } from '@qgs/shared';
import { createModuleLogger } from '~/utils/logger';
import prisma from '~/utils/prisma';

import { BaseService } from './base.service';
import { SystemLogService } from './system-log.service';

const logger = createModuleLogger('InspectionService');

interface InspectionItemInput {
  result?: string;
  standardValue?: null | number | string;
  measuredValue?: null | number | string;
  upperTolerance?: null | number | string;
  lowerTolerance?: null | number | string;
  checkItem?: string;
  activity?: string; // mapping for ITP
  uom?: string;
  unit?: string; // mapping for ITP
  acceptanceCriteria?: string;
  referenceDoc?: string;
  remarks?: string;
  order?: number;
}

interface PieDataItem {
  name: string;
  value: number;
}

interface TrendDataItem {
  period: string;
  value: number;
}

interface IssueStats {
  totalCount: number;
  openCount: number;
  closedCount: number;
  totalLoss: number;
  closedRate: number;
  pieData: PieDataItem[];
  trendData: TrendDataItem[];
}

interface InspectionRecordInput {
  category: 'INCOMING' | 'PROCESS' | 'SHIPMENT';
  workOrderNumber: string;
  projectName: string;
  supplierName?: string;
  materialName?: string;
  incomingType?: string;
  processName?: string;
  level1Component?: string;
  level2Component?: string;

  team?: string;
  documents?: string;
  hasDocuments?: boolean;
  packingListArchived?: string;
  quantity: number | string;
  inspector: string;
  inspectionDate: Date | string;
  reportDate?: Date | null | string;
  remarks?: string;
  items?: InspectionItemInput[];
}

export const InspectionService = {
  /**
   * Find all inspections with pagination, filtering and sorting
   */
  async findAll(params: {
    keyword?: string;
    page?: number;
    pageSize?: number;
    projectName?: string;
    type?: string;
    workOrderNumber?: string;
    year?: number;
  }) {
    const {
      page = 1,
      pageSize = 100,
      type = 'INCOMING',
      year,
      keyword,
      projectName,
      workOrderNumber,
    } = params;

    // Build Where Clause
    const where: Prisma.inspectionsWhereInput = {
      isDeleted: false,
    };

    // Category Filter
    if (type !== 'ALL') {
      where.category = type as any;
    }

    // Specific Filters
    if (workOrderNumber) where.workOrderNumber = workOrderNumber;
    if (projectName) where.projectName = { contains: projectName };

    // Keyword Search
    if (keyword) {
      where.OR = [
        { workOrderNumber: { contains: keyword } },
        { projectName: { contains: keyword } },
        { supplierName: { contains: keyword } },
        { inspector: { contains: keyword } },
      ];
    }

    // Date Range (Year)
    if (year) {
      where.inspectionDate = BaseService.buildYearFilter(year);
    }

    // Execute Query
    const { skip, take } = BaseService.parsePagination({ page, pageSize });
    const [items, total] = await Promise.all([
      prisma.inspections.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: { items: true },
      }),
      prisma.inspections.count({ where }),
    ]);

    return { items, total };
  },
  /**
   * Determine single item result
   */
  determineItemResult(item: InspectionItemInput): inspection_result {
    if (item.result === 'NA') return 'NA';
    // If manual result is provided and valid, use it (especially for qualitative)
    if (['CONDITIONAL', 'FAIL', 'PASS'].includes(item.result || '')) {
      // If quantitative, we might want to double check, but trust frontend for now or implement strict check
      if (item.standardValue && item.measuredValue) {
        const val = Number.parseFloat(String(item.measuredValue));
        const std = Number.parseFloat(String(item.standardValue));
        const upper = Number.parseFloat(String(item.upperTolerance || '0'));
        const lower = Number.parseFloat(String(item.lowerTolerance || '0'));

        if (
          !Number.isNaN(val) &&
          !Number.isNaN(std) &&
          (val > std + upper || val < std - lower)
        ) {
          return 'FAIL';
        }
      }
      return (item.result as inspection_result) || 'PASS';
    }
    return 'PASS';
  },

  /**
   * Calculate overall result
   */
  calculateOverallResult(items: InspectionItemInput[]): inspection_result {
    let hasFail = false;
    let hasConditional = false;

    for (const item of items) {
      if (item.result === 'FAIL') hasFail = true;
      if (item.result === 'CONDITIONAL') hasConditional = true;
    }

    if (hasFail) return 'FAIL';
    if (hasConditional) return 'CONDITIONAL' as any; // Prisma enum might not have CONDITIONAL? Let's check schema.
    return 'PASS';
  },

  /**
   * Generate Serial Number
   * Format: INS-YYYYMMDD-XXX
   */
  async generateSerialNumber(): Promise<string> {
    const dateStr = new Date().toISOString().slice(0, 10).replaceAll('-', '');
    const prefix = `INS-${dateStr}-`;

    // Find last record today
    const lastRecord = await prisma.inspections.findFirst({
      where: {
        serialNumber: {
          startsWith: prefix,
        },
      },
      orderBy: {
        serialNumber: 'desc',
      },
    });

    let seq = 1;
    if (lastRecord && lastRecord.serialNumber) {
      const parts = lastRecord.serialNumber.split('-');
      if (parts.length === 3) {
        seq = (Number.parseInt(parts[2]) || 0) + 1;
      }
    }

    return `${prefix}${String(seq).padStart(3, '0')}`;
  },

  async create(data: InspectionRecordInput) {
    const serialNumber = await this.generateSerialNumber();

    const overallResult = this.calculateOverallResult(data.items || []);

    return prisma.$transaction(async (tx) => {
      const inspection = await tx.inspections.create({
        data: {
          serialNumber,
          category: data.category,
          workOrderNumber: data.workOrderNumber,
          projectName: data.projectName,
          supplierName: data.supplierName,
          materialName: data.materialName,
          incomingType: data.incomingType,
          processName: data.processName,
          level1Component: data.level1Component,
          level2Component: data.level2Component,
          team: data.team,
          documents: data.documents,
          hasDocuments:
            data.hasDocuments === undefined ? true : data.hasDocuments,
          packingListArchived: data.packingListArchived,
          quantity: Number(data.quantity) || 1,
          inspector: data.inspector,
          inspectionDate: new Date(data.inspectionDate || new Date()),
          reportDate: data.reportDate ? new Date(data.reportDate) : null,
          result: overallResult,
          remarks: data.remarks,
          isDeleted: false,
          items: {
            create: (data.items || []).map((item: InspectionItemInput) => ({
              checkItem: item.checkItem || item.activity, // Handle ITP field mapping
              standardValue:
                item.standardValue !== undefined && item.standardValue !== null
                  ? String(item.standardValue)
                  : null,
              upperTolerance:
                item.upperTolerance !== undefined &&
                item.upperTolerance !== null
                  ? String(item.upperTolerance)
                  : null,
              lowerTolerance:
                item.lowerTolerance !== undefined &&
                item.lowerTolerance !== null
                  ? String(item.lowerTolerance)
                  : null,
              uom: item.uom || item.unit,
              acceptanceCriteria: item.acceptanceCriteria,
              referenceDoc: item.referenceDoc,
              measuredValue:
                item.measuredValue !== undefined && item.measuredValue !== null
                  ? String(item.measuredValue)
                  : null,
              result: (item.result as inspection_result) || 'PASS',
              remarks: item.remarks,
              order: item.order || 0,
            })),
          },
        },
      });
      return inspection;
    });
  },

  async update(id: string, data: InspectionRecordInput) {
    const overallResult = this.calculateOverallResult(data.items || []);

    return prisma.$transaction(async (tx) => {
      // 1. Update Main
      const inspection = await tx.inspections.update({
        where: { id },
        data: {
          workOrderNumber: data.workOrderNumber,
          projectName: data.projectName,
          supplierName: data.supplierName,
          materialName: data.materialName,
          incomingType: data.incomingType,
          processName: data.processName,
          level1Component: data.level1Component,
          level2Component: data.level2Component,
          team: data.team,
          documents: data.documents,
          hasDocuments: data.hasDocuments,
          packingListArchived: data.packingListArchived,
          quantity: Number(data.quantity),
          inspector: data.inspector,
          inspectionDate: data.inspectionDate
            ? new Date(data.inspectionDate)
            : undefined,
          reportDate: data.reportDate ? new Date(data.reportDate) : null,
          result: overallResult,
          remarks: data.remarks,
        },
      });

      // 2. Replace Items (Delete all & Create new)
      await tx.inspection_items.deleteMany({
        where: { inspectionId: id },
      });

      if (data.items && data.items.length > 0) {
        await tx.inspection_items.createMany({
          data: data.items.map((item) => ({
            inspectionId: id,
            checkItem: item.checkItem || item.activity,
            standardValue:
              item.standardValue !== undefined && item.standardValue !== null
                ? String(item.standardValue)
                : null,
            upperTolerance:
              item.upperTolerance !== undefined && item.upperTolerance !== null
                ? String(item.upperTolerance)
                : null,
            lowerTolerance:
              item.lowerTolerance !== undefined && item.lowerTolerance !== null
                ? String(item.lowerTolerance)
                : null,
            uom: item.uom || item.unit,
            acceptanceCriteria: item.acceptanceCriteria,
            referenceDoc: item.referenceDoc,
            measuredValue:
              item.measuredValue !== undefined && item.measuredValue !== null
                ? String(item.measuredValue)
                : null,
            result: (item.result as inspection_result) || 'PASS',
            remarks: item.remarks,
            order: item.order || 0,
          })),
        });
      }

      return inspection;
    });
  },

  async delete(id: string) {
    return prisma.inspections.update({
      where: { id },
      data: { isDeleted: true },
    });
  },

  async batchDelete(ids: string[]) {
    return prisma.inspections.updateMany({
      where: { id: { in: ids } },
      data: { isDeleted: true },
    });
  },

  async getIssues(params: {
    defectType?: string | string[];
    page?: number;
    pageSize?: number;
    processName?: string;
    projectName?: string;
    severity?: string | string[];
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    status?: string | string[];
    supplierName?: string;
    workOrderNumber?: string;
    year?: number;
  }): Promise<{ items: InspectionIssue[]; total: number }> {
    const where: Prisma.quality_recordsWhereInput = { isDeleted: false };

    if (params.processName) {
      where.processName = params.processName;
    }

    if (params.year) {
      const start = new Date(`${params.year}-01-01`);
      const end = new Date(`${params.year + 1}-01-01`);
      where.date = {
        gte: start,
        lt: end,
      };
    }

    if (params.projectName) {
      where.projectName = { contains: params.projectName };
    }

    if (params.workOrderNumber) {
      where.workOrderNumber = { contains: params.workOrderNumber };
    }

    // New Filters
    if (params.severity) {
      where.severity = Array.isArray(params.severity)
        ? { in: params.severity }
        : params.severity;
    }

    if (params.defectType) {
      where.defectType = Array.isArray(params.defectType)
        ? { in: params.defectType }
        : params.defectType;
    }

    if (params.status) {
      where.status = Array.isArray(params.status)
        ? { in: params.status as any }
        : (params.status as any);
    }

    const {
      page = 1,
      pageSize,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = params;
    const skip = pageSize && pageSize > 0 ? (page - 1) * pageSize : undefined;
    const take = pageSize && pageSize > 0 ? pageSize : undefined;

    const orderBy: Prisma.quality_recordsOrderByWithRelationInput = {};
    switch (sortBy) {
      case 'ncNumber': {
        orderBy.nonConformanceNumber = sortOrder;
        break;
      }
      case 'reportDate': {
        orderBy.date = sortOrder;
        break;
      }
      case 'reportedBy': {
        orderBy.inspector = sortOrder;
        break;
      }
      case 'title': {
        orderBy.partName = sortOrder;
        break;
      }
      default: {
        (orderBy as any)[sortBy] = sortOrder;
      }
    }

    const [total, issues] = await Promise.all([
      prisma.quality_records.count({ where }),
      prisma.quality_records.findMany({
        where,
        orderBy,
        skip,
        take,
      }),
    ]);

    const items: InspectionIssue[] = issues.map((issue) => {
      const photos = tryParsePhotos(issue.issuePhoto as string);

      return {
        ...issue,
        ncNumber: issue.nonConformanceNumber || '',
        reportDate: formatDate(issue.date),
        date: formatDate(issue.date),
        claim: issue.isClaim ? 'Yes' : 'No',
        isClaim: issue.isClaim,
        photos,
        severity: (issue.severity as 'Critical' | 'Major' | 'Minor') || 'Minor',
        status: issue.status as InspectionIssueStatusEnum,
        lossAmount: Number(issue.lossAmount) || 0,
        responsibleDepartment: issue.responsibleDepartment || '',
        reportedBy: issue.inspector || '', // Use inspector for reportedBy
        rootCause: issue.rootCause || '',
        solution: issue.solution || '',
        title: issue.partName || '',
        updatedAt: issue.updatedAt.toISOString(),
        workOrderNumber: issue.workOrderNumber || '',
        projectName: issue.projectName || '',
        quantity: issue.quantity || 0,
        inspector: issue.inspector || '',
        description: issue.description || '',
        partName: issue.partName || '',
      };
    });

    return { items, total };
  },

  async getIssueStats(year?: number): Promise<IssueStats> {
    const currentYear = year || new Date().getFullYear();
    const start = new Date(`${currentYear}-01-01`);
    const end = new Date(`${currentYear + 1}-01-01`);
    const where: Prisma.quality_recordsWhereInput = {
      isDeleted: false,
      date: { gte: start, lt: end },
    };

    try {
      // 1. Core aggregations (Total, Loss, Status counts)
      const [stats, closedCount] = await Promise.all([
        prisma.quality_records.aggregate({
          where,
          _count: { id: true },
          _sum: { lossAmount: true },
        }),
        prisma.quality_records.count({
          where: { ...where, status: 'CLOSED' },
        }),
      ]);

      const totalCount = stats._count.id || 0;
      const totalLoss = Number(stats._sum.lossAmount) || 0;
      const closedRate =
        totalCount > 0 ? Math.round((closedCount / totalCount) * 100) : 0;

      // 2. Defect Type Distribution
      const typeStats = await prisma.quality_records.groupBy({
        by: ['defectType'],
        where,
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
      });

      const pieData: PieDataItem[] = typeStats.map((s) => ({
        name: s.defectType || 'Unknown',
        value: s._count.id,
      }));

      // 3. Monthly Trend (Using Raw Query for efficiency)
      const trendResults = await prisma.$queryRaw<
        Array<{ amount: number; month: number }>
      >`
        SELECT 
          MONTH(date) as month,
          SUM(IFNULL(lossAmount, 0)) as amount
        FROM quality_records
        WHERE isDeleted = 0 AND date >= ${start} AND date < ${end}
        GROUP BY month
      `;

      const trendMap = new Map<string, number>();
      for (let i = 1; i <= 12; i++) {
        const monthKey = `${currentYear}-${String(i).padStart(2, '0')}`;
        trendMap.set(monthKey, 0);
      }

      trendResults.forEach((r) => {
        const monthKey = `${currentYear}-${String(r.month).padStart(2, '0')}`;
        if (trendMap.has(monthKey)) {
          trendMap.set(monthKey, Number(Number(r.amount).toFixed(2)));
        }
      });

      const trendData: TrendDataItem[] = [...trendMap.entries()].map(
        ([period, value]) => ({ period, value }),
      );

      return {
        totalCount,
        openCount: totalCount - closedCount,
        closedCount,
        totalLoss,
        closedRate,
        pieData,
        trendData,
      };
    } catch (error) {
      logger.error({ err: error, year }, 'getIssueStats failed');
      throw error;
    }
  },

  async generateNextNcNumber(): Promise<string> {
    const now = new Date();
    const yearShort = now.getFullYear().toString().slice(-2);
    // Format: NC-YYKJ-XXX
    const prefix = `NC-${yearShort}KJ-`;

    // Find the max existing number for this prefix
    const lastRecord = await prisma.quality_records.findFirst({
      where: {
        nonConformanceNumber: {
          startsWith: prefix,
        },
      },
      orderBy: {
        nonConformanceNumber: 'desc',
      },
      select: {
        nonConformanceNumber: true,
      },
    });

    let sequence = 1;
    if (lastRecord && lastRecord.nonConformanceNumber) {
      // Extract the last 3 digits
      const lastSequenceStr = lastRecord.nonConformanceNumber.slice(
        prefix.length,
      );
      const lastSequence = Number.parseInt(lastSequenceStr, 10);
      if (!Number.isNaN(lastSequence)) {
        sequence = lastSequence + 1;
      }
    }

    const sequenceStr = sequence.toString().padStart(3, '0');
    return `${prefix}${sequenceStr}`;
  },

  /**
   * Soft delete a record with audit logging
   */
  async deleteRecord(id: string, userId: string): Promise<void> {
    await prisma.quality_records.update({
      where: { id },
      data: {
        isDeleted: true,
        updatedAt: new Date(),
      },
    });

    // Record audit log
    await SystemLogService.recordAuditLog({
      userId,
      action: 'DELETE',
      targetType: 'inspection_issue',
      targetId: id,
      details: 'Soft deleted inspection issue record',
    });
  },
};
