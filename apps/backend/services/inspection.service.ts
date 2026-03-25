import type { archive_task_status, inspection_result } from '@prisma/client';
import type { InspectionIssue, InspectionIssueStatusEnum } from '@qgs/shared';
import type { InspectionIssueDateMode } from '~/utils/inspection-issue';

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import process from 'node:process';

import { Prisma } from '@prisma/client';
import { formatDate, tryParsePhotos } from '@qgs/shared';
import { resolveInspectionFormProcessCandidates } from '~/utils/inspection-form';
import { buildInspectionIssueDateRange } from '~/utils/inspection-issue';
import { createModuleLogger } from '~/utils/logger';
import { UPLOAD_DIR } from '~/utils/paths';
import prisma from '~/utils/prisma';
import {
  isPrismaMissingColumnError,
  isPrismaSchemaMismatchError,
  isPrismaUniqueConstraintError,
} from '~/utils/prisma-error';
import {
  parseProjectDocuments,
  stringifyProjectDocuments,
  upsertInspectionProjectDocuments,
} from '~/utils/project-documents';

import { BaseService } from './base.service';
import { DataScopeService } from './data-scope.service';
import { DeptService } from './dept.service';
import { SystemLogService } from './system-log.service';

const logger = createModuleLogger('InspectionService');
const inspectionTemplateAutoBindEnabled =
  process.env.INSPECTION_TEMPLATE_AUTO_BIND_ENABLED !== 'false';

function isInspectionSerialNumberConflict(error: unknown): boolean {
  if (!isPrismaUniqueConstraintError(error)) {
    return false;
  }
  const message = String((error as { message?: string })?.message || error);
  return (
    message.includes('serialNumber') ||
    message.includes('inspections_serialNumber_key')
  );
}

type LinkedIssueSummary = {
  quantity: number;
  status: string;
};

type InspectionQuantitySummary = {
  qualifiedQuantity: number;
  quantity: number;
  unqualifiedQuantity: number;
};

function deriveInspectionIssueStatus(issues: LinkedIssueSummary[]): string {
  if (issues.length === 0) {
    return 'NO_ISSUE';
  }

  const statusSet = new Set(
    issues.map((issue) => String(issue.status || '').toUpperCase()),
  );

  if (statusSet.has('OPEN')) return 'OPEN';
  if (statusSet.has('IN_PROGRESS') || statusSet.has('CLAIMING')) {
    return 'IN_PROGRESS';
  }
  if (statusSet.has('RESOLVED')) return 'RESOLVED';
  if (statusSet.has('CLOSED')) return 'CLOSED';

  return issues[0]?.status || 'OPEN';
}

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

type InspectionPrintHeaders = {
  checkItem: string;
  measuredValue: string;
  remarks: string;
  result: string;
  standard: string;
};

type InspectionTemplateMeta = {
  drawingNo: null | string;
  formNo: null | string;
};

function parseTemplateFields(raw: unknown): InspectionItemInput[] {
  if (Array.isArray(raw)) {
    return raw as InspectionItemInput[];
  }
  if (typeof raw !== 'string' || !raw.trim()) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as InspectionItemInput[]) : [];
  } catch {
    return [];
  }
}

function resolveInspectionPrintHeaders(
  templateFields: InspectionItemInput[],
  inspectionItems: Array<{
    acceptanceCriteria?: null | string;
    standardValue?: null | string;
  }>,
): InspectionPrintHeaders {
  const hasAcceptanceCriteria =
    templateFields.some((f) => String(f.acceptanceCriteria || '').trim()) ||
    inspectionItems.some((f) => String(f.acceptanceCriteria || '').trim());

  // 表头优先贴合检验表库上传模板：存在判定标准语义时统一使用“判定标准”。
  const standard = hasAcceptanceCriteria ? '判定标准' : '标准值';

  return {
    checkItem: '检查项目',
    measuredValue: '实测值',
    remarks: '备注',
    result: '结果',
    standard,
  };
}

function normalizeMetaText(value: unknown) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replaceAll(/\s+/g, '')
    .replaceAll(/[:：.。_\-/]/g, '');
}

function findLabelRightValue(
  row: unknown[],
  labelIndex: number,
): null | string {
  for (let index = labelIndex + 1; index < row.length; index++) {
    const value = String(row[index] || '').trim();
    if (!value) continue;
    const normalized = normalizeMetaText(value);
    if (
      normalized.includes('表单号及版本') ||
      normalized.includes('formnorev') ||
      normalized.includes('图号') ||
      normalized.includes('drawingno') ||
      normalized.includes('产品名称') ||
      normalized.includes('project')
    ) {
      continue;
    }
    return value;
  }
  return null;
}

function resolveMetaFromSheetRows(rows: unknown[][]): InspectionTemplateMeta {
  let drawingNo: null | string = null;
  let formNo: null | string = null;

  for (const row of rows) {
    for (let index = 0; index < row.length; index++) {
      const cell = String(row[index] || '').trim();
      if (!cell) continue;
      const normalized = normalizeMetaText(cell);

      if (
        !formNo &&
        (normalized.includes('表单号及版本') ||
          normalized.includes('formnorev') ||
          normalized.includes('formno&rev'))
      ) {
        formNo = findLabelRightValue(row, index);
      }

      if (
        !drawingNo &&
        (normalized.includes('图号') ||
          normalized.includes('drawingno') ||
          normalized.includes('drawing'))
      ) {
        drawingNo = findLabelRightValue(row, index);
      }

      if (formNo && drawingNo) {
        return {
          drawingNo,
          formNo,
        };
      }
    }
  }

  return {
    drawingNo,
    formNo,
  };
}

async function resolveTemplateMetaFromAttachment(
  attachmentUrl: null | string | undefined,
): Promise<InspectionTemplateMeta> {
  const attachment = String(attachmentUrl || '').trim();
  if (!attachment) {
    return {
      drawingNo: null,
      formNo: null,
    };
  }

  const rawFileName = basename(attachment.split('?')[0] || '');
  let fileName = rawFileName;
  try {
    fileName = decodeURIComponent(rawFileName);
  } catch {
    fileName = rawFileName;
  }
  if (!fileName) {
    return {
      drawingNo: null,
      formNo: null,
    };
  }

  const extension = extname(fileName).toLowerCase();
  if (!['.csv', '.xls', '.xlsx'].includes(extension)) {
    return {
      drawingNo: null,
      formNo: null,
    };
  }

  try {
    const candidatePaths = [
      join(UPLOAD_DIR, fileName),
      join(process.cwd(), 'uploads', fileName),
      join(process.cwd(), 'apps', 'backend', 'uploads', fileName),
      join(process.cwd(), '..', 'uploads', fileName),
      join(process.cwd(), '..', '..', 'uploads', fileName),
    ];
    const filePath = candidatePaths.find((item) => existsSync(item));
    if (!filePath) {
      logger.warn(
        `resolve-template-meta-from-attachment file not found: ${fileName}`,
      );
      return {
        drawingNo: null,
        formNo: null,
      };
    }

    const fileBuffer = await readFile(filePath);
    const XLSX = await import('xlsx');
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    for (const sheetName of workbook.SheetNames || []) {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) continue;
      const rows = XLSX.utils.sheet_to_json(sheet, {
        defval: '',
        header: 1,
        raw: false,
      }) as unknown[][];
      if (!Array.isArray(rows) || rows.length === 0) continue;
      const meta = resolveMetaFromSheetRows(rows);
      if (meta.formNo || meta.drawingNo) {
        return meta;
      }
    }
  } catch (error) {
    logger.warn(
      `resolve-template-meta-from-attachment failed: ${String(
        (error as { message?: string })?.message || error,
      )} (${String(attachmentUrl || '')})`,
    );
  }

  return {
    drawingNo: null,
    formNo: null,
  };
}

interface PieDataItem {
  name: string;
  value: number;
}

interface ParetoDataItem {
  cumulativePercent: number;
  label: string;
  percent: number;
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
  pareto: ParetoDataItem[];
  pieData: PieDataItem[];
  trendData: TrendDataItem[];
}

type InspectionIssueChartAggregateItem = {
  name: string;
  value: number;
};

type InspectionIssueChartDimension =
  | 'claim'
  | 'defectSubtype'
  | 'defectType'
  | 'division'
  | 'projectName'
  | 'reportMonth'
  | 'responsibleDepartment'
  | 'severity'
  | 'status'
  | 'supplierName';

type InspectionIssueChartMetric = 'count' | 'lossAmount' | 'quantity';

type ArchiveTaskStatus = 'ARCHIVED' | 'IN_PROGRESS' | 'PENDING' | 'REJECTED';

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
  qualifiedQuantity?: number | string;
  unqualifiedQuantity?: number | string;
  inspector: string;
  templateId?: string;
  templateName?: string;
  inspectionDate: Date | string;
  result?: string;
  reportDate?: Date | null | string;
  remarks?: string;
  items?: InspectionItemInput[];
}

function normalizeOptionalString(value?: string) {
  const text = String(value || '').trim();
  return text || null;
}

async function resolveInspectionTemplateBinding(
  tx: Prisma.TransactionClient,
  data: InspectionRecordInput,
) {
  const directTemplateId = String(data.templateId || '').trim();
  const directTemplateName = String(data.templateName || '').trim();
  if (directTemplateId || directTemplateName) {
    return {
      templateId: directTemplateId || null,
      templateName: directTemplateName || null,
    };
  }

  if (!inspectionTemplateAutoBindEnabled) {
    return {
      templateId: null,
      templateName: null,
    };
  }

  const workOrderNumber = String(data.workOrderNumber || '').trim();
  if (!workOrderNumber) {
    return {
      templateId: null,
      templateName: null,
    };
  }
  const processCandidates = resolveInspectionFormProcessCandidates({
    category: data.category,
    incomingType: data.incomingType || null,
    processName: data.processName || null,
  });
  if (processCandidates.length === 0) {
    return {
      templateId: null,
      templateName: null,
    };
  }

  const partCandidates = [
    String(data.materialName || '').trim(),
    String(data.level2Component || '').trim(),
    String(data.level1Component || '').trim(),
  ].filter((item, index, arr) => Boolean(item) && arr.indexOf(item) === index);
  let matchedTemplate = null;
  for (const partName of partCandidates) {
    matchedTemplate = await tx.inspection_form_templates.findFirst({
      where: {
        isDeleted: false,
        partName,
        processName: {
          in: processCandidates,
        },
        status: 'active',
        workOrderNumber,
      },
      orderBy: [{ updatedAt: 'desc' }],
      select: {
        formName: true,
        id: true,
      },
    });
    if (matchedTemplate) {
      break;
    }
  }
  if (!matchedTemplate) {
    matchedTemplate = await tx.inspection_form_templates.findFirst({
      where: {
        isDeleted: false,
        OR: [{ partName: null }, { partName: '' }],
        processName: {
          in: processCandidates,
        },
        status: 'active',
        workOrderNumber,
      },
      orderBy: [{ updatedAt: 'desc' }],
      select: {
        formName: true,
        id: true,
      },
    });
  }

  return {
    templateId: matchedTemplate?.id || null,
    templateName: matchedTemplate?.formName || null,
  };
}

type InspectionProjectDocSyncSource = {
  category?: string;
  documents?: null | string;
  hasDocuments?: boolean;
  id: string;
  incomingType?: null | string;
  level1Component?: null | string;
  level2Component?: null | string;
  materialName?: null | string;
  processName?: null | string;
  projectName?: null | string;
  result?: null | string;
  workOrderNumber: string;
};

type InspectionArchiveTaskSyncSource = {
  documents?: null | string;
  hasDocuments?: boolean;
  id: string;
  inspectionDate?: Date | null;
  inspector: string;
  projectName?: null | string;
  remarks?: null | string;
  result?: null | string;
  workOrderNumber: string;
};

function resolveArchiveDueAt(inspectionDate?: Date | null) {
  const dueAt = new Date(inspectionDate || new Date());
  dueAt.setHours(23, 59, 59, 999);
  return dueAt;
}

function shouldRequireArchiveTask(source: InspectionArchiveTaskSyncSource) {
  return (
    Boolean(source.hasDocuments) ||
    Boolean(String(source.documents || '').trim()) ||
    String(source.result || '')
      .trim()
      .toUpperCase() === 'FAIL'
  );
}

function buildArchiveWorkContent(source: InspectionArchiveTaskSyncSource) {
  const remarks = String(source.remarks || '').trim();
  if (remarks) {
    return remarks;
  }
  const datePart = (source.inspectionDate || new Date())
    .toISOString()
    .slice(0, 10);
  return `${datePart} 检验资料归档`;
}

async function syncInspectionArchiveTask(
  tx: Prisma.TransactionClient,
  source: InspectionArchiveTaskSyncSource,
) {
  try {
    if (!shouldRequireArchiveTask(source)) {
      await tx.inspection_archive_tasks.deleteMany({
        where: { inspectionId: source.id },
      });
      return;
    }

    const existing = await tx.inspection_archive_tasks.findUnique({
      where: { inspectionId: source.id },
      select: {
        archivedAt: true,
        status: true,
      },
    });

    const dueAt = resolveArchiveDueAt(source.inspectionDate);
    const hasAttachments = Boolean(String(source.documents || '').trim());
    const preferredStatus: archive_task_status = hasAttachments
      ? 'ARCHIVED'
      : 'PENDING';
    let status: archive_task_status = preferredStatus;
    if (existing?.status === 'ARCHIVED') {
      status = 'ARCHIVED';
    }
    const archivedAt =
      status === 'ARCHIVED' ? existing?.archivedAt || new Date() : null;
    const now = new Date();

    await tx.inspection_archive_tasks.upsert({
      where: { inspectionId: source.id },
      update: {
        archivedAt,
        attachments: source.documents || null,
        dueAt,
        inspectionDate: source.inspectionDate || now,
        inspector: source.inspector,
        isOverdue: status !== 'ARCHIVED' && now > dueAt,
        projectName: source.projectName || null,
        status,
        workContent: buildArchiveWorkContent(source),
        workOrderNumber: source.workOrderNumber,
      },
      create: {
        attachments: source.documents || null,
        dueAt,
        inspectionDate: source.inspectionDate || now,
        inspector: source.inspector,
        isOverdue: status !== 'ARCHIVED' && now > dueAt,
        projectName: source.projectName || null,
        status,
        workContent: buildArchiveWorkContent(source),
        workOrderNumber: source.workOrderNumber,
        inspectionId: source.id,
        archivedAt,
      },
    });
  } catch (error) {
    if (isPrismaSchemaMismatchError(error)) {
      logger.warn('Skip inspection archive-task sync: schema not ready');
      return;
    }
    throw error;
  }
}

async function syncInspectionProjectDocuments(
  tx: Prisma.TransactionClient,
  source: InspectionProjectDocSyncSource,
) {
  try {
    const currentProject = await tx.doc_projects.findUnique({
      where: { workOrderNumber: source.workOrderNumber },
      select: {
        documents: true,
        id: true,
        projectName: true,
      },
    });

    const nextDocuments = upsertInspectionProjectDocuments(
      parseProjectDocuments(currentProject?.documents),
      source,
    );

    if (currentProject) {
      await tx.doc_projects.update({
        where: { id: currentProject.id },
        data: {
          documents: stringifyProjectDocuments(nextDocuments),
          projectName: source.projectName || currentProject.projectName,
          updatedAt: new Date(),
        },
      });
      return;
    }

    if (nextDocuments.length === 0) {
      return;
    }

    await tx.doc_projects.create({
      data: {
        documents: stringifyProjectDocuments(nextDocuments),
        projectName: source.projectName || source.workOrderNumber,
        status: 'active',
        workOrderNumber: source.workOrderNumber,
      },
    });
  } catch (error) {
    if (isPrismaMissingColumnError(error)) {
      logger.warn(
        'Skip inspection project-doc sync: doc_projects.documents missing',
      );
      return;
    }
    throw error;
  }
}

export const InspectionService = {
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
          formFields: true,
        },
      });
      templateFields = parseTemplateFields(template?.formFields);
      templateMeta = await resolveTemplateMetaFromAttachment(
        template?.attachments,
      );
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
      printHeaders,
      reportDate: inspection.reportDate
        ? formatDate(inspection.reportDate)
        : null,
    };
  },

  /**
   * Find all inspections with pagination, filtering and sorting
   */
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

      const { skip, take } = BaseService.parsePagination({
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

  resolveOverallResult(data: InspectionRecordInput): inspection_result {
    const computed = this.calculateOverallResult(data.items || []);
    if (computed === 'FAIL') return 'FAIL';

    const manual = String(data.result || '')
      .trim()
      .toUpperCase();
    if (manual === 'FAIL') return 'FAIL';

    return computed;
  },

  normalizeQuantitySummary(
    data: Pick<
      InspectionRecordInput,
      'qualifiedQuantity' | 'quantity' | 'result' | 'unqualifiedQuantity'
    >,
  ): InspectionQuantitySummary {
    const totalQuantity = Math.max(1, Number(data.quantity) || 1);
    const rawQualified = Number(data.qualifiedQuantity);
    const rawUnqualified = Number(data.unqualifiedQuantity);
    const hasQualified = Number.isFinite(rawQualified);
    const hasUnqualified = Number.isFinite(rawUnqualified);

    if (
      hasQualified &&
      hasUnqualified &&
      rawQualified + rawUnqualified === totalQuantity
    ) {
      return {
        quantity: totalQuantity,
        qualifiedQuantity: rawQualified,
        unqualifiedQuantity: rawUnqualified,
      };
    }

    if (hasUnqualified) {
      const unqualifiedQuantity = Math.max(
        0,
        Math.min(totalQuantity, rawUnqualified),
      );
      return {
        quantity: totalQuantity,
        qualifiedQuantity: totalQuantity - unqualifiedQuantity,
        unqualifiedQuantity,
      };
    }

    if (hasQualified) {
      const qualifiedQuantity = Math.max(
        0,
        Math.min(totalQuantity, rawQualified),
      );
      return {
        quantity: totalQuantity,
        qualifiedQuantity,
        unqualifiedQuantity: totalQuantity - qualifiedQuantity,
      };
    }

    const manualResult = String(data.result || '')
      .trim()
      .toUpperCase();
    if (manualResult === 'FAIL') {
      return {
        quantity: totalQuantity,
        qualifiedQuantity: 0,
        unqualifiedQuantity: totalQuantity,
      };
    }

    return {
      quantity: totalQuantity,
      qualifiedQuantity: totalQuantity,
      unqualifiedQuantity: 0,
    };
  },

  assertResultQuantityConsistency(
    result: inspection_result,
    summary: InspectionQuantitySummary,
  ) {
    const normalizedResult = String(result || '')
      .trim()
      .toUpperCase();
    const total = Math.max(1, Number(summary.quantity) || 1);
    const unqualified = Math.max(
      0,
      Math.min(total, Number(summary.unqualifiedQuantity) || 0),
    );

    if (normalizedResult === 'PASS' && unqualified > 0) {
      throw new Error('VALIDATION:检验结论为合格时，不合格数量必须为 0');
    }

    if (normalizedResult === 'FAIL' && unqualified <= 0) {
      throw new Error('VALIDATION:检验结论为不合格时，不合格数量必须大于 0');
    }
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
    const overallResult = this.resolveOverallResult(data);
    const quantitySummary = this.normalizeQuantitySummary({
      quantity: data.quantity,
      qualifiedQuantity: data.qualifiedQuantity,
      unqualifiedQuantity: data.unqualifiedQuantity,
      result: overallResult,
    });
    this.assertResultQuantityConsistency(overallResult, quantitySummary);
    const maxRetry = 5;
    for (let attempt = 1; attempt <= maxRetry; attempt++) {
      try {
        const serialNumber = await this.generateSerialNumber();
        return await prisma.$transaction(async (tx) => {
          const templateBinding = await resolveInspectionTemplateBinding(
            tx,
            data,
          );
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
              quantity: quantitySummary.quantity,
              qualifiedQuantity: quantitySummary.qualifiedQuantity,
              unqualifiedQuantity: quantitySummary.unqualifiedQuantity,
              inspector: data.inspector,
              templateId: templateBinding.templateId,
              templateName: templateBinding.templateName,
              inspectionDate: new Date(data.inspectionDate || new Date()),
              reportDate: data.reportDate ? new Date(data.reportDate) : null,
              result: overallResult,
              remarks: data.remarks,
              isDeleted: false,
              items: {
                create: (data.items || []).map((item: InspectionItemInput) => ({
                  checkItem: item.checkItem || item.activity, // Handle ITP field mapping
                  standardValue:
                    item.standardValue !== undefined &&
                    item.standardValue !== null
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
                    item.measuredValue !== undefined &&
                    item.measuredValue !== null
                      ? String(item.measuredValue)
                      : null,
                  result: (item.result as inspection_result) || 'PASS',
                  remarks: item.remarks,
                  order: item.order || 0,
                })),
              },
            },
          });
          await syncInspectionProjectDocuments(tx, inspection);
          await syncInspectionArchiveTask(tx, inspection);
          return inspection;
        });
      } catch (error) {
        if (attempt < maxRetry && isInspectionSerialNumberConflict(error)) {
          logger.warn(
            { attempt, maxRetry, module: 'InspectionService' },
            'inspection serial number conflict, retrying create',
          );
          continue;
        }
        throw error;
      }
    }

    throw new Error('创建检验记录失败：流水号冲突重试超限');
  },

  async update(id: string, data: InspectionRecordInput) {
    const overallResult = this.resolveOverallResult(data);
    const quantitySummary = this.normalizeQuantitySummary({
      quantity: data.quantity,
      qualifiedQuantity: data.qualifiedQuantity,
      unqualifiedQuantity: data.unqualifiedQuantity,
      result: overallResult,
    });
    this.assertResultQuantityConsistency(overallResult, quantitySummary);

    return prisma.$transaction(async (tx) => {
      const previousInspection = await tx.inspections.findUnique({
        where: { id },
        select: {
          category: true,
          incomingType: true,
          processName: true,
          templateId: true,
          templateName: true,
          workOrderNumber: true,
        },
      });
      const templateBinding = await resolveInspectionTemplateBinding(tx, {
        ...data,
        category: data.category || previousInspection?.category || 'PROCESS',
        incomingType:
          data.incomingType === undefined
            ? previousInspection?.incomingType || undefined
            : data.incomingType,
        processName:
          data.processName === undefined
            ? previousInspection?.processName || undefined
            : data.processName,
        workOrderNumber:
          data.workOrderNumber || previousInspection?.workOrderNumber || '',
      });

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
          quantity: quantitySummary.quantity,
          qualifiedQuantity: quantitySummary.qualifiedQuantity,
          unqualifiedQuantity: quantitySummary.unqualifiedQuantity,
          inspector: data.inspector,
          templateId:
            data.templateId === undefined
              ? (templateBinding.templateId ?? previousInspection?.templateId)
              : normalizeOptionalString(data.templateId),
          templateName:
            data.templateName === undefined
              ? (templateBinding.templateName ??
                previousInspection?.templateName)
              : normalizeOptionalString(data.templateName),
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

      if (
        previousInspection?.workOrderNumber &&
        previousInspection.workOrderNumber !== inspection.workOrderNumber
      ) {
        await syncInspectionProjectDocuments(tx, {
          ...inspection,
          hasDocuments: false,
          workOrderNumber: previousInspection.workOrderNumber,
        });
      }

      await syncInspectionProjectDocuments(tx, inspection);
      await syncInspectionArchiveTask(tx, inspection);

      return inspection;
    });
  },

  async delete(id: string) {
    return prisma.$transaction(async (tx) => {
      const inspection = await tx.inspections.findUnique({
        where: { id },
        select: {
          category: true,
          documents: true,
          hasDocuments: true,
          id: true,
          incomingType: true,
          level1Component: true,
          level2Component: true,
          materialName: true,
          processName: true,
          projectName: true,
          result: true,
          workOrderNumber: true,
        },
      });

      const deleted = await tx.inspections.update({
        where: { id },
        data: { isDeleted: true },
      });

      if (inspection) {
        await syncInspectionProjectDocuments(tx, {
          ...inspection,
          hasDocuments: false,
        });
        await tx.inspection_archive_tasks.deleteMany({
          where: { inspectionId: inspection.id },
        });
      }

      return deleted;
    });
  },

  async batchDelete(ids: string[]) {
    return prisma.$transaction(async (tx) => {
      const inspections = await tx.inspections.findMany({
        where: { id: { in: ids } },
        select: {
          category: true,
          documents: true,
          hasDocuments: true,
          id: true,
          incomingType: true,
          level1Component: true,
          level2Component: true,
          materialName: true,
          processName: true,
          projectName: true,
          result: true,
          workOrderNumber: true,
        },
      });

      const result = await tx.inspections.updateMany({
        where: { id: { in: ids } },
        data: { isDeleted: true },
      });

      for (const inspection of inspections) {
        await syncInspectionProjectDocuments(tx, {
          ...inspection,
          hasDocuments: false,
        });
        await tx.inspection_archive_tasks.deleteMany({
          where: { inspectionId: inspection.id },
        });
      }

      return result;
    });
  },

  async getArchiveTasks(params: {
    date?: string;
    inspector?: string;
    page?: number;
    pageSize?: number;
    status?: ArchiveTaskStatus;
  }) {
    const page = Math.max(1, Number(params.page || 1));
    const pageSize = Math.max(1, Math.min(200, Number(params.pageSize || 20)));
    const date = params.date ? new Date(params.date) : new Date();
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);

    const where: Prisma.inspection_archive_tasksWhereInput = {
      inspectionDate: { gte: start, lte: end },
      isDeleted: false,
    };

    if (params.inspector) {
      where.inspector = params.inspector;
    }
    if (params.status) {
      where.status = params.status;
    }

    let items = [] as Awaited<
      ReturnType<typeof prisma.inspection_archive_tasks.findMany>
    >;
    let total = 0;
    try {
      [items, total] = await Promise.all([
        prisma.inspection_archive_tasks.findMany({
          where,
          skip: (page - 1) * pageSize,
          take: pageSize,
          orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
        }),
        prisma.inspection_archive_tasks.count({ where }),
      ]);
    } catch (error) {
      if (!isPrismaSchemaMismatchError(error)) {
        throw error;
      }
      logger.warn('Skip inspection archive tasks query: schema not ready');
      return { items: [], total: 0 };
    }

    const now = new Date();
    const normalizedItems = items.map((item) => ({
      ...item,
      isOverdue: item.status !== 'ARCHIVED' && now > item.dueAt,
    }));

    return { items: normalizedItems, total };
  },

  async updateArchiveTaskStatus(params: {
    id: string;
    status: ArchiveTaskStatus;
    workContent?: string;
  }) {
    const existing = await prisma.inspection_archive_tasks.findUnique({
      where: { id: params.id },
    });
    if (!existing || existing.isDeleted) {
      throw new Error('归档任务不存在');
    }

    const status = String(params.status || '')
      .trim()
      .toUpperCase() as ArchiveTaskStatus;
    if (!['ARCHIVED', 'IN_PROGRESS', 'PENDING', 'REJECTED'].includes(status)) {
      throw new Error('归档状态不合法');
    }

    const nextWorkContent =
      params.workContent === undefined
        ? String(existing.workContent || '').trim()
        : String(params.workContent || '').trim();

    if (status === 'ARCHIVED') {
      const hasAttachments = Boolean(String(existing.attachments || '').trim());
      if (!existing.workOrderNumber || !existing.projectName) {
        throw new Error('工单号或项目名称缺失，无法归档');
      }
      if (!nextWorkContent) {
        throw new Error('请先填写工作内容再归档');
      }
      if (!hasAttachments) {
        throw new Error('请先上传至少一份资料附件再归档');
      }
    }

    const now = new Date();
    const archivedAt = status === 'ARCHIVED' ? now : null;

    return prisma.inspection_archive_tasks.update({
      where: { id: params.id },
      data: {
        archivedAt,
        isOverdue: status !== 'ARCHIVED' && now > existing.dueAt,
        status,
        workContent: nextWorkContent || null,
      },
    });
  },

  async getIssues(params: {
    dateMode?: InspectionIssueDateMode;
    dateValue?: string;
    defectType?: string | string[];
    page?: number;
    pageSize?: number;
    processName?: string;
    projectName?: string;
    responsibleDepartment?: string | string[];
    responsibleWelder?: string;
    severity?: string | string[];
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    status?: string | string[];
    supplierName?: string;
    userContext?: { userId: string; username?: string };
    workOrderNumber?: string;
    year?: number;
  }): Promise<{ items: InspectionIssue[]; total: number }> {
    let where: Prisma.quality_recordsWhereInput = { isDeleted: false };

    if (params.processName) {
      where.processName = params.processName;
    }

    const { start, end } = buildInspectionIssueDateRange({
      dateMode: params.dateMode,
      dateValue: params.dateValue,
      year: params.year,
    });
    where.date = {
      gte: start,
      lt: end,
    };

    if (params.projectName) {
      where.projectName = { contains: params.projectName };
    }

    if (params.workOrderNumber) {
      where.workOrderNumber = { contains: params.workOrderNumber };
    }

    if (params.supplierName) {
      where.supplierName = { contains: params.supplierName };
    }
    if (params.responsibleWelder) {
      where.responsibleWelder = { contains: params.responsibleWelder };
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

    if (params.responsibleDepartment) {
      const deptTree = await DeptService.findAll().catch(() => []);
      const searchTerms = (
        Array.isArray(params.responsibleDepartment)
          ? params.responsibleDepartment
          : [params.responsibleDepartment]
      )
        .map((item) => String(item || '').trim())
        .filter(Boolean);

      const matchedDeptIds = new Set<string>();
      const matchedDeptNames = new Set<string>();
      const collectMatchedDeptMeta = (nodes: any[]) => {
        for (const node of nodes || []) {
          const nodeId = String(node.id || '');
          const nodeName = String(node.name || '');
          if (
            searchTerms.some(
              (term) => nodeId === term || nodeName.includes(term),
            )
          ) {
            if (nodeId) matchedDeptIds.add(nodeId);
            if (nodeName) matchedDeptNames.add(nodeName);
          }
          if (Array.isArray(node.children) && node.children.length > 0) {
            collectMatchedDeptMeta(node.children);
          }
        }
      };

      collectMatchedDeptMeta(deptTree as any[]);

      const exactCandidates = [
        ...new Set([...matchedDeptIds, ...matchedDeptNames, ...searchTerms]),
      ];
      let existingAndConditions: Prisma.quality_recordsWhereInput[] = [];
      if (Array.isArray(where.AND)) {
        existingAndConditions = where.AND;
      } else if (where.AND) {
        existingAndConditions = [where.AND];
      }
      const fuzzyConditions = searchTerms.map((term) => ({
        responsibleDepartment: { contains: term },
      }));
      const responsibleDepartmentConditions = [
        ...(exactCandidates.length > 0
          ? [{ responsibleDepartment: { in: exactCandidates } }]
          : []),
        ...fuzzyConditions,
      ];

      where.AND = [
        ...existingAndConditions,
        {
          OR: responsibleDepartmentConditions,
        },
      ];
    }

    if (params.userContext?.userId) {
      where = await DataScopeService.buildInspectionWhere(where, {
        userId: params.userContext.userId,
        username: params.userContext.username,
      });
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
        inspectionId: issue.inspectionId || undefined,
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
        responsibleWelder: issue.responsibleWelder || '',
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

  async getIssueStats(params: {
    dateMode?: InspectionIssueDateMode;
    dateValue?: string;
    year?: number;
  }): Promise<IssueStats> {
    const currentYear = params.year || new Date().getFullYear();
    const { start, end } = buildInspectionIssueDateRange({
      dateMode: params.dateMode,
      dateValue: params.dateValue,
      year: params.year,
    });
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
      let cumulativeCount = 0;
      const pareto: ParetoDataItem[] = pieData.map((item) => {
        cumulativeCount += item.value;
        return {
          label: item.name,
          value: item.value,
          percent:
            totalCount > 0 ? Math.round((item.value / totalCount) * 100) : 0,
          cumulativePercent:
            totalCount > 0
              ? Math.round((cumulativeCount / totalCount) * 100)
              : 0,
        };
      });

      // 3. Monthly Trend (Using Raw Query for efficiency)
      const trendData = await this.buildIssueTrendData({
        currentYear,
        dateMode: params.dateMode,
        end,
        start,
      });

      return {
        totalCount,
        openCount: totalCount - closedCount,
        closedCount,
        totalLoss,
        closedRate,
        pareto,
        pieData,
        trendData,
      };
    } catch (error) {
      logger.error({ err: error, params }, 'getIssueStats failed');
      throw error;
    }
  },

  async getIssueChartAggregation(params: {
    dateMode?: InspectionIssueDateMode;
    dateValue?: string;
    dimension: InspectionIssueChartDimension;
    metric: InspectionIssueChartMetric;
    top?: number;
    userContext?: { userId: string; username?: string };
    year?: number;
  }): Promise<InspectionIssueChartAggregateItem[]> {
    const { start, end } = buildInspectionIssueDateRange({
      dateMode: params.dateMode,
      dateValue: params.dateValue,
      year: params.year,
    });

    let where: Prisma.quality_recordsWhereInput = {
      isDeleted: false,
      date: { gte: start, lt: end },
    };
    if (params.userContext?.userId) {
      where = await DataScopeService.buildInspectionWhere(where, {
        userId: params.userContext.userId,
        username: params.userContext.username,
      });
    }

    const rows = await prisma.quality_records.findMany({
      where,
      select: {
        date: true,
        defectSubtype: true,
        defectType: true,
        division: true,
        isClaim: true,
        lossAmount: true,
        projectName: true,
        quantity: true,
        responsibleDepartment: true,
        severity: true,
        status: true,
        supplierName: true,
      },
    });

    const aggregateMap = new Map<string, number>();
    for (const row of rows) {
      let key = '未分类';
      switch (params.dimension) {
        case 'claim': {
          key = row.isClaim ? 'Yes' : 'No';
          break;
        }
        case 'defectSubtype': {
          key = row.defectSubtype || '未分类';
          break;
        }
        case 'defectType': {
          key = row.defectType || '未分类';
          break;
        }
        case 'division': {
          key = row.division || '未分类';
          break;
        }
        case 'projectName': {
          key = row.projectName || '未分类';
          break;
        }
        case 'reportMonth': {
          key = formatDate(row.date).slice(0, 7);
          break;
        }
        case 'responsibleDepartment': {
          key = row.responsibleDepartment || '未分类';
          break;
        }
        case 'severity': {
          key = row.severity || '未分类';
          break;
        }
        case 'status': {
          key = row.status || '未分类';
          break;
        }
        case 'supplierName': {
          key = row.supplierName || '未分类';
          break;
        }
      }

      let value = 1;
      if (params.metric === 'lossAmount') {
        value = Number(row.lossAmount || 0);
      } else if (params.metric === 'quantity') {
        value = Number(row.quantity || 0);
      }
      aggregateMap.set(key, (aggregateMap.get(key) || 0) + value);
    }

    const top = Number(params.top) > 0 ? Number(params.top) : 15;
    return [...aggregateMap.entries()]
      .map(([name, value]) => ({
        name,
        value: Math.round(value * 100) / 100,
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, top);
  },

  async buildIssueTrendData(params: {
    currentYear: number;
    dateMode?: InspectionIssueDateMode;
    end: Date;
    start: Date;
  }): Promise<TrendDataItem[]> {
    if (params.dateMode === 'month' || params.dateMode === 'week') {
      const dayMap = new Map<string, number>();
      const cursor = new Date(params.start);

      while (cursor < params.end) {
        const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
        dayMap.set(key, 0);
        cursor.setDate(cursor.getDate() + 1);
      }

      const trendResults = await prisma.$queryRaw<
        Array<{ amount: number; day: string }>
      >`
        SELECT 
          DATE(date) as day,
          SUM(IFNULL(lossAmount, 0)) as amount
        FROM quality_records
        WHERE isDeleted = 0 AND date >= ${params.start} AND date < ${params.end}
        GROUP BY DATE(date)
      `;

      trendResults.forEach((item) => {
        const key = String(item.day);
        if (dayMap.has(key)) {
          dayMap.set(key, Number(Number(item.amount).toFixed(2)));
        }
      });

      return [...dayMap.entries()].map(([period, value]) => ({
        period,
        value,
      }));
    }

    const trendResults = await prisma.$queryRaw<
      Array<{ amount: number; month: number }>
    >`
      SELECT 
        MONTH(date) as month,
        SUM(IFNULL(lossAmount, 0)) as amount
      FROM quality_records
      WHERE isDeleted = 0 AND date >= ${params.start} AND date < ${params.end}
      GROUP BY month
    `;

    const trendMap = new Map<string, number>();
    for (let i = 1; i <= 12; i++) {
      const monthKey = `${params.currentYear}-${String(i).padStart(2, '0')}`;
      trendMap.set(monthKey, 0);
    }

    trendResults.forEach((r) => {
      const monthKey = `${params.currentYear}-${String(r.month).padStart(2, '0')}`;
      if (trendMap.has(monthKey)) {
        trendMap.set(monthKey, Number(Number(r.amount).toFixed(2)));
      }
    });

    return [...trendMap.entries()].map(([period, value]) => ({
      period,
      value,
    }));
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
