import type { IdentityResolutionReason } from '@qgs/shared';

export interface InspectionIssueStatisticsRow {
  defectCategoryId?: null | string;
  defectSubcategoryId?: null | string;
  defectSubtype?: null | string;
  defectType?: null | string;
  division?: null | string;
  divisionId?: null | string;
  projectId?: null | string;
  projectName?: null | string;
  responsibleDepartment?: null | string;
  responsibleDepartmentId?: null | string;
  supplierId?: null | string;
  supplierName?: null | string;
}

export interface InspectionIssueStatisticsIdentity {
  id: null | string;
  missingName?: string;
  rawName: null | string;
  resolutionReason?: Exclude<IdentityResolutionReason, 'INVALID_REFERENCE'>;
}

function normalizeText(value: null | string | undefined) {
  return String(value || '').trim() || null;
}

function joinClassificationEvidence(
  category: null | string | undefined,
  subcategory: null | string | undefined,
) {
  return [normalizeText(category), normalizeText(subcategory)]
    .filter(Boolean)
    .join(' / ');
}

export function resolveInspectionIssueStatisticsIdentity(
  dimension: string,
  row: InspectionIssueStatisticsRow,
): InspectionIssueStatisticsIdentity | null {
  switch (dimension) {
    case 'defectSubtype': {
      return {
        id: normalizeText(row.defectSubcategoryId),
        rawName:
          joinClassificationEvidence(row.defectType, row.defectSubtype) || null,
      };
    }
    case 'defectType': {
      return {
        id: normalizeText(row.defectCategoryId),
        rawName: normalizeText(row.defectType),
      };
    }
    case 'division': {
      return {
        id: normalizeText(row.divisionId),
        rawName: normalizeText(row.division),
      };
    }
    case 'projectName': {
      return {
        id: normalizeText(row.projectId),
        rawName: normalizeText(row.projectName),
      };
    }
    case 'responsibleDepartment': {
      return {
        id: normalizeText(row.responsibleDepartmentId),
        rawName: normalizeText(row.responsibleDepartment),
      };
    }
    case 'supplierName': {
      const id = normalizeText(row.supplierId);
      const rawName = normalizeText(row.supplierName);
      return {
        id,
        missingName: !id && !rawName ? '不涉及供应商' : undefined,
        rawName,
        resolutionReason:
          !id && !rawName ? 'NOT_APPLICABLE' : 'MISSING_REQUIRED',
      };
    }
    default: {
      return null;
    }
  }
}

export function getInspectionIssueStatisticsIdentityKey(
  identity: InspectionIssueStatisticsIdentity,
) {
  if (identity.id) return `id:${identity.id}`;
  return [
    'missing',
    identity.resolutionReason || 'MISSING_REQUIRED',
    identity.rawName || '',
  ].join(':');
}
