import type {
  InspectionItemInput,
  InspectionTemplateMeta,
} from './inspection-record-types';

import { Prisma } from '@prisma/client';
import { formatDate } from '@qgs/shared';
import { createModuleLogger } from '~/utils/logger';
import prisma from '~/utils/prisma';
import { isPrismaSchemaMismatchError } from '~/utils/prisma-error';
import { resolveCanonicalProcessName as resolveCanonicalProcessNameByRelation } from '~/utils/process-resolver';
import {
  buildKeywordOr,
  buildYearFilter,
  parsePagination,
} from '~/utils/query-helpers';

import {
  deriveInspectionIssueStatus,
  normalizeInspectionCategory,
  parseTemplateFields,
  resolveInspectionPrintHeaders,
} from './inspection-record-types';
import { resolveTemplateMetaFromAttachment } from './inspection-template-meta.service';

const logger = createModuleLogger('InspectionService');

export const InspectionRecordQueryService = {
  async findById(id: string) {
    const inspection = await prisma.inspections.findFirst({
      where: {
        id,
        isDeleted: false,
      },
      include: {
        items: {
          orderBy: [{ order: 'asc' }],
        },
        process: {
          select: {
            name: true,
          },
        },
      },
    });

    if (!inspection) {
      return null;
    }

    let templateFields: InspectionItemInput[] = [];
    let templateMeta: InspectionTemplateMeta = {
      drawingNo: null,
      formNo: null,
    };
    if (inspection.templateId) {
      const template = await prisma.inspection_form_templates.findUnique({
        where: { id: inspection.templateId },
        select: {
          attachments: true,
          drawingNo: true,
          formFields: true,
          formNo: true,
        },
      });
      templateFields = parseTemplateFields(template?.formFields);
      templateMeta = {
        drawingNo: String(template?.drawingNo || '').trim() || null,
        formNo: String(template?.formNo || '').trim() || null,
      };
      if (!templateMeta.formNo || !templateMeta.drawingNo) {
        const attachmentMeta = await resolveTemplateMetaFromAttachment(
          template?.attachments,
        );
        templateMeta = {
          drawingNo: templateMeta.drawingNo || attachmentMeta.drawingNo,
          formNo: templateMeta.formNo || attachmentMeta.formNo,
        };
      }
    }

    const printHeaders = resolveInspectionPrintHeaders(
      templateFields,
      inspection.items || [],
    );

    return {
      ...inspection,
      drawingNo: templateMeta.drawingNo,
      formNo: templateMeta.formNo,
      inspectionDate: formatDate(inspection.inspectionDate),
      processName: resolveCanonicalProcessNameByRelation(inspection),
      printHeaders,
      reportDate: inspection.reportDate
        ? formatDate(inspection.reportDate)
        : null,
    };
  },
  async findAll(params: {
    forExport?: boolean;
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
      forExport = false,
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
      const category = normalizeInspectionCategory(type);
      if (category) {
        where.category = category;
      }
    }

    // Specific Filters
    if (workOrderNumber) where.workOrderNumber = workOrderNumber;
    if (projectName) where.projectName = { contains: projectName };

    // Keyword Search
    const keywordOr = buildKeywordOr(keyword, [
      'workOrderNumber',
      'projectName',
      'supplierName',
      'inspector',
    ] as const);
    if (keywordOr) Object.assign(where, keywordOr);

    // Date Range (Year)
    if (year) {
      where.inspectionDate = buildYearFilter(year);
    }

    const runQuery = async (withArchiveTask: boolean) => {
      const include = {
        ...(withArchiveTask
          ? {
              archiveTask: {
                select: {
                  dueAt: true,
                  id: true,
                  isOverdue: true,
                  status: true,
                },
              },
            }
          : {}),
        items: true,
        process: {
          select: {
            name: true,
          },
        },
        qualityRecords: {
          select: {
            quantity: true,
            status: true,
          },
          where: { isDeleted: false },
        },
      } as const;

      if (forExport) {
        return Promise.all([
          prisma.inspections.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            include,
          }),
          prisma.inspections.count({ where }),
        ]);
      }

      const { skip, take } = parsePagination({
        page,
        pageSize,
      });
      return Promise.all([
        prisma.inspections.findMany({
          where,
          skip,
          take,
          orderBy: { createdAt: 'desc' },
          include,
        }),
        prisma.inspections.count({ where }),
      ]);
    };

    let rawItems;
    let total;
    try {
      [rawItems, total] = await runQuery(true);
    } catch (error) {
      if (!isPrismaSchemaMismatchError(error)) {
        throw error;
      }
      logger.warn('Skip inspection archiveTask include: schema not ready');
      [rawItems, total] = await runQuery(false);
    }

    const items = rawItems.map((item) => {
      const linkedIssues = item.qualityRecords || [];
      const fallbackUnqualifiedQuantity = linkedIssues.reduce(
        (sum, issue) => sum + Number(issue.quantity || 0),
        0,
      );
      const unqualifiedQuantity =
        item.unqualifiedQuantity === null ||
        item.unqualifiedQuantity === undefined
          ? fallbackUnqualifiedQuantity
          : Number(item.unqualifiedQuantity || 0);

      return {
        ...item,
        archiveDueAt: item.archiveTask?.dueAt || null,
        archiveTaskId: item.archiveTask?.id || null,
        archiveIsOverdue: Boolean(item.archiveTask?.isOverdue),
        archiveTaskStatus: item.archiveTask?.status || null,
        issueStatus: deriveInspectionIssueStatus(linkedIssues),
        processName: resolveCanonicalProcessNameByRelation(item),
        qualifiedQuantity:
          item.qualifiedQuantity === null ||
          item.qualifiedQuantity === undefined
            ? Math.max(0, Number(item.quantity || 1) - unqualifiedQuantity)
            : Number(item.qualifiedQuantity || 0),
        unqualifiedQuantity,
      };
    });

    return { items, total };
  },
};
