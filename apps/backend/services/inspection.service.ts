import type { inspection_result } from '@prisma/client';

import prisma from '~/utils/prisma';

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
   * Determine single item result
   */
  determineItemResult(item: InspectionItemInput): inspection_result {
    if (item.result === 'NA') return 'NA' as inspection_result;
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
  calculateOverallResult(
    items: InspectionItemInput[],
  ): 'CONDITIONAL' | 'FAIL' | 'PASS' {
    let hasFail = false;
    let hasConditional = false;

    for (const item of items) {
      if (item.result === 'FAIL') hasFail = true;
      if (item.result === 'CONDITIONAL') hasConditional = true;
    }

    if (hasFail) return 'FAIL';
    if (hasConditional) return 'CONDITIONAL';
    return 'PASS';
  },

  /**
   * Generate Serial Number
   * Format: INS-YYYYMMDD-XXX
   */
  async generateSerialNumber() {
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
        seq = Number.parseInt(parts[2]) + 1;
      }
    }

    return `${prefix}${String(seq).padStart(3, '0')}`;
  },

  async create(data: InspectionRecordInput) {
    const serialNumber = await this.generateSerialNumber();

    // Calculate results just in case, or trust payload?
    // Let's trust payload for now but recalculate overall
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
          // Update allowed fields
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
      // This is simpler than diffing for this use case
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
    page?: number;
    pageSize?: number;
    processName?: string;
    projectName?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    status?: string;
    supplierName?: string;
    workOrderNumber?: string;
    year?: number;
  }) {
    const where: Record<string, unknown> = { isDeleted: false };

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

    if (params.status) {
      where.status = params.status;
    }

    if (params.supplierName) {
      where.supplierName = { contains: params.supplierName };
    }

    if (params.workOrderNumber) {
      where.workOrderNumber = { contains: params.workOrderNumber };
    }

    const {
      page = 1,
      pageSize,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = params;
    const skip = pageSize && pageSize > 0 ? (page - 1) * pageSize : undefined;
    const take = pageSize && pageSize > 0 ? pageSize : undefined;

    // Map sortBy to actual prisma fields if necessary
    // For now we assume they match or handle specific ones
    const orderBy: Record<string, 'asc' | 'desc'> = {};
    if (sortBy === 'ncNumber') {
      orderBy.nonConformanceNumber = sortOrder;
    } else {
      orderBy[sortBy] = sortOrder;
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

    const items = issues.map((issue) => {
      let photos: string[] = [];
      try {
        if (issue.issuePhoto) {
          photos = issue.issuePhoto.startsWith('[')
            ? JSON.parse(issue.issuePhoto)
            : issue.issuePhoto.split(',').filter(Boolean);
        }
      } catch {
        photos = [];
      }

      return {
        ...issue,
        ncNumber: issue.nonConformanceNumber,
        reportDate: issue.date ? issue.date.toISOString().split('T')[0] : '',
        claim: issue.isClaim ? 'Yes' : 'No',
        photos,
        severity: (issue.severity as 'Critical' | 'Major' | 'Minor') || 'Minor', // Default to Minor if null
      };
    });

    return { items, total };
  },

  async getIssueStats(year?: number): Promise<IssueStats> {
    const where: Record<string, unknown> = { isDeleted: false };
    const currentYear = year || new Date().getFullYear();

    if (currentYear) {
      const start = new Date(`${currentYear}-01-01`);
      const end = new Date(`${currentYear + 1}-01-01`);
      where.date = {
        gte: start,
        lt: end,
      };
    }

    const issues = await prisma.quality_records.findMany({
      where,
      select: {
        status: true,
        lossAmount: true,
        defectType: true,
        date: true,
      },
    });

    const totalCount = issues.length;
    const closedCount = issues.filter((i) => i.status === 'CLOSED').length;
    const openCount = totalCount - closedCount;
    const totalLoss = issues.reduce(
      (sum, i) => sum + (Number(i.lossAmount) || 0),
      0,
    );
    const closedRate =
      totalCount > 0 ? Math.round((closedCount / totalCount) * 100) : 0;

    // Defect Type distribution
    const typeMap = new Map<string, number>();
    issues.forEach((i) => {
      const type = i.defectType || 'Unknown';
      typeMap.set(type, (typeMap.get(type) || 0) + 1);
    });
    const pieData = [...typeMap.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    // Monthly trend
    const trendMap = new Map<string, number>();
    for (let i = 1; i <= 12; i++) {
      const monthKey = `${currentYear}-${String(i).padStart(2, '0')}`;
      trendMap.set(monthKey, 0);
    }

    issues.forEach((i) => {
      const month = i.date.toISOString().slice(0, 7);
      if (trendMap.has(month)) {
        trendMap.set(month, (trendMap.get(month) || 0) + Number(i.lossAmount));
      }
    });

    const trendData = [...trendMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([period, value]) => ({ period, value }));

    return {
      totalCount,
      openCount,
      closedCount,
      totalLoss,
      closedRate,
      pieData,
      trendData,
    };
  },

  async generateNextNcNumber() {
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
};
