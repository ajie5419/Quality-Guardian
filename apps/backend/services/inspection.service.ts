import prisma from '~/utils/prisma';

export const InspectionService = {
  /**
   * Determine single item result
   */
  determineItemResult(item: any): 'PASS' | 'FAIL' {
    if (item.result === 'NA') return 'NA' as any; // Prisma enum issue if strict typing
    // If manual result is provided and valid, use it (especially for qualitative)
    if (['PASS', 'FAIL', 'CONDITIONAL'].includes(item.result)) {
        // If quantitative, we might want to double check, but trust frontend for now or implement strict check
        if (item.standardValue && item.measuredValue) {
             const val = parseFloat(item.measuredValue);
             const std = parseFloat(item.standardValue);
             const upper = parseFloat(item.upperTolerance || '0');
             const lower = parseFloat(item.lowerTolerance || '0');
             
             if (!isNaN(val) && !isNaN(std)) {
                 if (val > std + upper || val < std - lower) {
                     return 'FAIL';
                 }
             }
        }
        return item.result;
    }
    return 'PASS';
  },

  /**
   * Calculate overall result
   */
  calculateOverallResult(items: any[]): 'PASS' | 'FAIL' | 'CONDITIONAL' {
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
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const prefix = `INS-${dateStr}-`;
    
    // Find last record today
    const lastRecord = await prisma.inspections.findFirst({
      where: {
        serialNumber: {
          startsWith: prefix
        }
      },
      orderBy: {
        serialNumber: 'desc'
      }
    });

    let seq = 1;
    if (lastRecord && lastRecord.serialNumber) {
      const parts = lastRecord.serialNumber.split('-');
      if (parts.length === 3) {
        seq = parseInt(parts[2]) + 1;
      }
    }

    return `${prefix}${String(seq).padStart(3, '0')}`;
  },

  async create(data: any) {
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
            create: (data.items || []).map((item: any) => ({
              checkItem: item.checkItem || item.activity, // Handle ITP field mapping
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
              result: item.result || 'PASS',
              remarks: item.remarks,
              order: item.order || 0,
            })),
          },
        }
      });
      return inspection;
    });
  },

  async update(id: string, data: any) {
    const overallResult = this.calculateOverallResult(data.items || []);

    return prisma.$transaction(async (tx) => {
      // 1. Update Main
      const inspection = await tx.inspections.update({
        where: { id },
        data: {
          // Update allowed fields
          supplierName: data.supplierName,
          materialName: data.materialName,
          incomingType: data.incomingType,
          processName: data.processName,
          level1Component: data.level1Component,
          team: data.team,
          documents: data.documents,
          packingListArchived: data.packingListArchived,
          quantity: Number(data.quantity),
          inspector: data.inspector,
          inspectionDate: data.inspectionDate ? new Date(data.inspectionDate) : undefined,
          reportDate: data.reportDate ? new Date(data.reportDate) : null,
          result: overallResult,
          remarks: data.remarks,
        }
      });

      // 2. Replace Items (Delete all & Create new)
      // This is simpler than diffing for this use case
      await tx.inspection_items.deleteMany({
        where: { inspectionId: id }
      });

      if (data.items && data.items.length > 0) {
        await tx.inspection_items.createMany({
          data: data.items.map((item: any) => ({
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
            result: item.result || 'PASS',
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
      data: { isDeleted: true }
    });
  },

  async batchDelete(ids: string[]) {
    return prisma.inspections.updateMany({
      where: { id: { in: ids } },
      data: { isDeleted: true }
    });
  },

  async getIssues(params: {
    year?: number;
    projectName?: string;
    status?: string;
    supplierName?: string;
    workOrderNumber?: string;
  }) {
    const where: any = { isDeleted: false };

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

    const issues = await prisma.quality_records.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return issues.map((issue) => ({
      ...issue,
      ncNumber: issue.nonConformanceNumber,
      claim: issue.isClaim,
      photos: issue.issuePhoto ? issue.issuePhoto.split(',') : [], // Assuming comma separated or just return as is if frontend handles it
    }));
  }
};
