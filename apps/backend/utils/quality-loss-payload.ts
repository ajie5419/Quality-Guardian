import type { Prisma, quality_losses } from '@prisma/client';

import { nanoid } from 'nanoid';
import {
  buildQualityLossCreateData as buildQualityLossCreateDataRule,
  buildQualityLossCreateResponse as buildQualityLossCreateResponseRule,
} from '@qgs/domain';

export function createQualityLossId(now = new Date()): string {
  return `QL-${now.getFullYear()}-${nanoid(6).toUpperCase()}`;
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
