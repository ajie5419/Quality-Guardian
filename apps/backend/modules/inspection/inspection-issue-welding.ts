import type { Prisma } from '@prisma/client';

import { WELDING_DEFECT_CODE, WELDING_PROCESS_KEYWORD } from '@qgs/shared';
import { BusinessError } from '~/utils/business-error';

import { normalizeInspectionRequestText } from './inspection-request';

export interface WeldingIssueInput {
  defectSubcategoryId?: unknown;
  processName?: unknown;
  responsibleWelder?: unknown;
}

export function isWeldingDefectSubcategory(
  subcategory: null | undefined | { code?: string; name?: string },
) {
  if (!subcategory) return false;
  return (
    normalizeInspectionRequestText(subcategory.code) === WELDING_DEFECT_CODE ||
    normalizeInspectionRequestText(subcategory.name).includes(
      WELDING_PROCESS_KEYWORD,
    )
  );
}

// Welding defects must always carry a responsible welder regardless of the
// entry point (close dialog, standalone issue create/update) and of the
// subcategory display name, so the stable classification code is checked first.
export async function assertWelderForWeldingDefect(
  issue: WeldingIssueInput,
  tx: Prisma.TransactionClient,
) {
  const processName = normalizeInspectionRequestText(issue.processName);
  if (processName.includes(WELDING_PROCESS_KEYWORD)) {
    if (!normalizeInspectionRequestText(issue.responsibleWelder)) {
      throw new BusinessError('VALIDATION', '焊接工序必须填写责任焊工', 400);
    }
    return;
  }
  const subcategoryId = normalizeInspectionRequestText(
    issue.defectSubcategoryId,
  );
  if (!subcategoryId) return;
  const subcategory = await tx.quality_classification_subcategories.findFirst({
    select: { code: true, name: true },
    where: { id: subcategoryId, isDeleted: false },
  });
  if (
    isWeldingDefectSubcategory(subcategory) &&
    !normalizeInspectionRequestText(issue.responsibleWelder)
  ) {
    throw new BusinessError('VALIDATION', '焊接缺陷必须填写责任焊工', 400);
  }
}
