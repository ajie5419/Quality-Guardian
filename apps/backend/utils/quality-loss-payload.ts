import type { Prisma, quality_losses } from '@prisma/client';

import {
  buildQualityLossCreateData as buildQualityLossCreateDataRule,
  buildQualityLossCreateResponse as buildQualityLossCreateResponseRule,
  createQualityLossId as createQualityLossIdRule,
} from '@qgs/domain';

export function createQualityLossId(now = new Date()): string {
  return createQualityLossIdRule(now);
}

export function buildQualityLossCreateData(
  body: Record<string, unknown>,
  lossId: string,
): Prisma.quality_lossesUncheckedCreateInput {
  return buildQualityLossCreateDataRule(
    body,
    lossId,
  ) as Prisma.quality_lossesUncheckedCreateInput;
}

export function buildQualityLossCreateResponse(item: quality_losses) {
  return buildQualityLossCreateResponseRule(item);
}
