import type { inspection_category, inspection_result } from '@prisma/client';

import { deriveIssueTrackingStatus, ISSUE_TRACKING_STATUS } from '@qgs/shared';
import { BusinessError } from '~/utils/business-error';
import { isPrismaUniqueConstraintError } from '~/utils/prisma-error';

const INSPECTION_CATEGORY_VALUES = new Set<string>([
  'INCOMING',
  'PROCESS',
  'SHIPMENT',
]);

export function isInspectionSerialNumberConflict(error: unknown): boolean {
  if (!isPrismaUniqueConstraintError(error)) {
    return false;
  }
  const message = String((error as { message?: string })?.message || error);
  return (
    message.includes('serialNumber') ||
    message.includes('inspections_serialNumber_key')
  );
}

export function isInspectionCategory(
  value: string,
): value is inspection_category {
  return INSPECTION_CATEGORY_VALUES.has(value);
}

export function normalizeInspectionCategory(
  value: unknown,
): inspection_category | undefined {
  const normalized = String(value || '')
    .trim()
    .toUpperCase();
  return isInspectionCategory(normalized) ? normalized : undefined;
}

export type LinkedIssueSummary = {
  quantity: number;
  status: string;
};

export type InspectionQuantitySummary = {
  qualifiedQuantity: number;
  quantity: number;
  unqualifiedQuantity: number;
};

export function deriveInspectionIssueStatus(
  issues: LinkedIssueSummary[],
): string {
  const status = deriveIssueTrackingStatus(issues.map((issue) => issue.status));
  return status === ISSUE_TRACKING_STATUS.NO_ISSUE
    ? ISSUE_TRACKING_STATUS.NO_ISSUE
    : status;
}

export interface InspectionItemInput {
  result?: string;
  standardValue?: null | number | string;
  measuredValue?: null | number | string;
  upperTolerance?: null | number | string;
  lowerTolerance?: null | number | string;
  checkItem?: string;
  activity?: string;
  uom?: string;
  unit?: string;
  acceptanceCriteria?: string;
  referenceDoc?: string;
  remarks?: string;
  order?: number;
}

export type InspectionPrintHeaders = {
  checkItem: string;
  measuredValue: string;
  remarks: string;
  result: string;
  standard: string;
};

export type InspectionTemplateMeta = {
  drawingNo: null | string;
  formNo: null | string;
};

export interface InspectionRecordInput {
  category: 'INCOMING' | 'PROCESS' | 'SHIPMENT';
  workOrderNumber: string;
  projectName?: string;
  partId?: null | string;
  partName?: string;
  supplierId?: null | string;
  supplierName?: string;
  materialName?: string;
  incomingType?: string;
  processName?: string;
  processId?: null | string;
  level1Component?: string;
  level2Component?: string;
  team?: string;
  teamId?: null | string;
  documents?: string;
  hasDocuments?: boolean;
  selfCheckDocuments?: string;
  hasSelfCheckDocuments?: boolean;
  packingListArchived?: string;
  quantity: number | string;
  stationSelection?: null | string;
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

export function normalizeOptionalString(value?: string) {
  const text = String(value || '').trim();
  return text || null;
}

export function parseTemplateFields(raw: unknown): InspectionItemInput[] {
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

export function resolveInspectionPrintHeaders(
  templateFields: InspectionItemInput[],
  inspectionItems: Array<{
    acceptanceCriteria?: null | string;
    standardValue?: null | string;
  }>,
): InspectionPrintHeaders {
  const hasAcceptanceCriteria =
    templateFields.some((f) => String(f.acceptanceCriteria || '').trim()) ||
    inspectionItems.some((f) => String(f.acceptanceCriteria || '').trim());

  const standard = hasAcceptanceCriteria ? '判定标准' : '标准值';

  return {
    checkItem: '检查项目',
    measuredValue: '实测值',
    remarks: '备注',
    result: '结果',
    standard,
  };
}

export const InspectionRecordRules = {
  determineItemResult(item: InspectionItemInput): inspection_result {
    if (item.result === 'NA') return 'NA';
    if (['CONDITIONAL', 'FAIL', 'PASS'].includes(item.result || '')) {
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

  calculateOverallResult(items: InspectionItemInput[]): inspection_result {
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

  resolveOverallResult(data: InspectionRecordInput): inspection_result {
    const computed = InspectionRecordRules.calculateOverallResult(
      data.items || [],
    );
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
      throw new BusinessError(
        'VALIDATION',
        '检验结论为合格时，不合格数量必须为 0',
      );
    }

    if (normalizedResult === 'FAIL' && unqualified <= 0) {
      throw new BusinessError(
        'VALIDATION',
        '检验结论为不合格时，不合格数量必须大于 0',
      );
    }
  },
};
