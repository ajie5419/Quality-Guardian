import type { Prisma } from '@prisma/client';

import { normalizeOptionalInspectionIssueString } from '@qgs/shared';

export function normalizeInspectorRelationForIssueUpdate(
  updateData: Prisma.quality_recordsUpdateInput,
): Prisma.quality_recordsUpdateInput {
  const raw = updateData as Record<string, unknown>;
  if (!('inspector' in raw)) return updateData;
  const { inspector, ...rest } = raw;
  const username = normalizeOptionalInspectionIssueString(inspector);
  return {
    ...rest,
    users_quality_records_inspectorTousers: username
      ? { connect: { username } }
      : { disconnect: true },
  } as Prisma.quality_recordsUpdateInput;
}
