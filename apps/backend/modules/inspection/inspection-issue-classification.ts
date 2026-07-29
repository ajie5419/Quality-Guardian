import type {
  QualityClassificationScope,
  QualityClassificationSelection,
} from '@qgs/shared';

import {
  normalizeOptionalInspectionIssueString,
  QUALITY_CLASSIFICATION_SCOPE,
} from '@qgs/shared';
import { QualityClassificationService } from '~/modules/quality-classification';

import { resolveIssueSupplierBody } from './inspection-issue-supplier';

interface IssueSupplierInspection {
  category: string;
  supplierId?: null | string;
  teamId?: null | string;
}

interface CanonicalIssueBody {
  body: Record<string, unknown>;
  classification?: QualityClassificationSelection;
}

async function assertClassification(
  body: Record<string, unknown>,
  scope: QualityClassificationScope,
) {
  return QualityClassificationService.assertSelection(
    scope,
    normalizeOptionalInspectionIssueString(body.defectCategoryId) || '',
    normalizeOptionalInspectionIssueString(body.defectSubcategoryId) || '',
  );
}

function applyClassification(
  body: Record<string, unknown>,
  classification: QualityClassificationSelection,
) {
  return {
    ...body,
    defectSubtype: classification.subcategory.name,
    defectType: classification.category.name,
  };
}

export async function resolveInspectionIssueCreateBody(
  body: Record<string, unknown>,
  inspection?: IssueSupplierInspection | null,
): Promise<CanonicalIssueBody> {
  const supplierBody = (await resolveIssueSupplierBody(
    body,
    inspection,
    true,
  )) as Record<string, unknown>;
  const classification = await assertClassification(
    supplierBody,
    QUALITY_CLASSIFICATION_SCOPE.INSPECTION_ISSUE_DEFECT,
  );
  return {
    body: applyClassification(supplierBody, classification),
    classification,
  };
}

export async function resolveInspectionIssueUpdateBody(
  body: Record<string, unknown>,
  inspection?: IssueSupplierInspection | null,
): Promise<CanonicalIssueBody> {
  const supplierBody = (await resolveIssueSupplierBody(
    body,
    inspection,
    false,
  )) as Record<string, unknown>;
  const hasClassificationInput =
    supplierBody.defectCategoryId !== undefined ||
    supplierBody.defectSubcategoryId !== undefined;
  if (!hasClassificationInput) return { body: supplierBody };
  const classification = await assertClassification(
    supplierBody,
    QUALITY_CLASSIFICATION_SCOPE.INSPECTION_ISSUE_DEFECT,
  );
  return {
    body: applyClassification(supplierBody, classification),
    classification,
  };
}
