import type { Prisma } from '@prisma/client';

import { BusinessError } from '~/utils/business-error';
import { MasterDataGovernanceKernel } from '~/utils/canonical-master-data';

type RequiredProcessIdentity = { processId: string; processName: string };

function normalizeList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => String(item || '').trim()))].filter(
    Boolean,
  );
}

export function hasBomRequiredProcessIdentityUpdate(
  input: Record<string, unknown>,
) {
  return (
    Object.prototype.hasOwnProperty.call(input, 'requiredProcessIds') ||
    Object.prototype.hasOwnProperty.call(input, 'requiredProcesses')
  );
}

export async function resolveBomRequiredProcessIdentities(
  input: Record<string, unknown>,
): Promise<RequiredProcessIdentity[]> {
  const processIds = normalizeList(input.requiredProcessIds);
  const legacyNames = normalizeList(input.requiredProcesses);
  if (processIds.length === 0 && legacyNames.length === 0) return [];
  if (processIds.length === 0) {
    throw new BusinessError(
      'CANONICAL_ID_REQUIRED',
      'requiredProcessIds are required when requiredProcesses are provided',
    );
  }

  const names = await MasterDataGovernanceKernel.resolveCanonicalNamesByIds({
    canonicalIds: processIds,
    configKey: 'processName',
  });
  return processIds.map((processId) => {
    const processName = String(names.get(processId) || '').trim();
    if (!processName) {
      throw new BusinessError(
        'INVALID_CANONICAL_ID',
        `Unknown process identity: ${processId}`,
      );
    }
    return { processId, processName };
  });
}

export async function replaceBomRequiredProcessIdentities(
  tx: Prisma.TransactionClient,
  bomId: string,
  identities: RequiredProcessIdentity[],
) {
  await tx.project_bom_required_processes.deleteMany({ where: { bomId } });
  if (identities.length === 0) return;
  await tx.project_bom_required_processes.createMany({
    data: identities.map((item, position) => ({
      bomId,
      position,
      processId: item.processId,
      processName: item.processName,
    })),
  });
}
