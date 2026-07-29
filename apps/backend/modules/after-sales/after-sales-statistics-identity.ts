import type { IdentityResolutionReason } from '@qgs/shared';

import type { AfterSalesChartDimension } from './after-sales-analytics.service';

export type AfterSalesStatisticsSnapshotField =
  | 'defectSubtype'
  | 'defectType'
  | 'productSubtype'
  | 'productType'
  | 'respDept'
  | 'supplierBrand';

export interface AfterSalesStatisticsRow {
  defectCategoryId?: null | string;
  defectSubcategoryId?: null | string;
  defectSubtype?: null | string;
  defectType?: null | string;
  productCategoryId?: null | string;
  productSubcategoryId?: null | string;
  productSubtype?: null | string;
  productType?: null | string;
  respDept?: null | string;
  respDeptId?: null | string;
  supplierBrand?: null | string;
  supplierBrandId?: null | string;
}

export interface AfterSalesStatisticsIdentity {
  id: null | string;
  missingName?: string;
  rawName: null | string;
  resolutionReason?: Exclude<IdentityResolutionReason, 'INVALID_REFERENCE'>;
}

const SNAPSHOT_FIELDS: Partial<
  Record<AfterSalesChartDimension, AfterSalesStatisticsSnapshotField[]>
> = {
  defectSubtype: ['defectType', 'defectSubtype'],
  defectType: ['defectType'],
  productSubtype: ['productType', 'productSubtype'],
  productType: ['productType'],
  responsibleDept: ['respDept'],
  supplierBrand: ['supplierBrand'],
};

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

export function getAfterSalesStatisticsSnapshotFields(
  dimension: AfterSalesChartDimension,
) {
  return SNAPSHOT_FIELDS[dimension] || [];
}

export function resolveAfterSalesStatisticsIdentity(
  dimension: AfterSalesChartDimension,
  row: AfterSalesStatisticsRow,
): AfterSalesStatisticsIdentity | null {
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
    case 'productSubtype': {
      return {
        id: normalizeText(row.productSubcategoryId),
        rawName:
          joinClassificationEvidence(row.productType, row.productSubtype) ||
          null,
      };
    }
    case 'productType': {
      return {
        id: normalizeText(row.productCategoryId),
        rawName: normalizeText(row.productType),
      };
    }
    case 'reportMonth': {
      return null;
    }
    case 'responsibleDept': {
      return {
        id: normalizeText(row.respDeptId),
        rawName: normalizeText(row.respDept),
      };
    }
    case 'severity':
    case 'status': {
      return null;
    }
    case 'supplierBrand': {
      const id = normalizeText(row.supplierBrandId);
      const rawName = normalizeText(row.supplierBrand);
      return {
        id,
        missingName: !id && !rawName ? '未关联供应商' : undefined,
        rawName,
        resolutionReason:
          !id && !rawName ? 'NOT_APPLICABLE' : 'MISSING_REQUIRED',
      };
    }
  }
}

export function getAfterSalesStatisticsIdentityKey(
  identity: AfterSalesStatisticsIdentity,
) {
  if (identity.id) return `id:${identity.id}`;
  return [
    'missing',
    identity.resolutionReason || 'MISSING_REQUIRED',
    identity.rawName || '',
  ].join(':');
}
