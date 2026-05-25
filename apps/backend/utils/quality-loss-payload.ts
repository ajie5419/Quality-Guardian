import type { Prisma, quality_losses } from '@prisma/client';

import {
  buildQualityLossCreateData as buildQualityLossCreateDataRule,
  buildQualityLossCreateResponse as buildQualityLossCreateResponseRule,
  createQualityLossId as createQualityLossIdRule,
} from '@qgs/domain';
import {
  buildGovernedCanonicalWritePairForTable,
  buildGovernedWriteFieldsForTable,
} from '~/core/master-data/governance-write';

export function createQualityLossId(now = new Date()): string {
  return createQualityLossIdRule(now);
}

export function buildQualityLossCreateData(
  body: Record<string, unknown>,
  lossId: string,
): Prisma.quality_lossesUncheckedCreateInput {
  const data = buildQualityLossCreateDataRule(
    body,
    lossId,
  ) as Prisma.quality_lossesUncheckedCreateInput;
  return {
    ...data,
    ...buildGovernedWriteFieldsForTable(
      'quality_losses',
      data as Record<string, unknown>,
    ),
  } as Prisma.quality_lossesUncheckedCreateInput;
}

export async function buildQualityLossCreateDataWithCanonical(
  body: Record<string, unknown>,
  lossId: string,
): Promise<Prisma.quality_lossesUncheckedCreateInput> {
  const data = buildQualityLossCreateDataRule(
    body,
    lossId,
  ) as Prisma.quality_lossesUncheckedCreateInput;
  const governedCanonicalIds = await buildGovernedCanonicalWritePairForTable(
    'quality_losses',
    data as Record<string, unknown>,
  );
  return {
    ...data,
    ...buildGovernedWriteFieldsForTable(
      'quality_losses',
      data as Record<string, unknown>,
    ),
    ...governedCanonicalIds,
  } as Prisma.quality_lossesUncheckedCreateInput;
}

export function buildQualityLossCreateResponse(item: quality_losses) {
  return buildQualityLossCreateResponseRule(item);
}
