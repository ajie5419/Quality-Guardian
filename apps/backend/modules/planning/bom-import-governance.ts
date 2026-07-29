import { BusinessError } from '~/utils/business-error';
import { MasterDataGovernanceKernel } from '~/utils/canonical-master-data';
import {
  buildGovernedCanonicalWritePairForTable,
  buildGovernedWriteFieldsForTable,
} from '~/utils/governed-write';

import { resolveBomRequiredProcessIdentities } from './bom-process-identities';

function normalizeIdentityList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => String(item || '').trim()))].filter(
    Boolean,
  );
}

/** Legacy BOM files may resolve exact names because they predate canonical IDs. */
export async function resolveBomImportProcessIdentities(
  input: Record<string, unknown>,
) {
  const processIds = normalizeIdentityList(input.requiredProcessIds);
  if (processIds.length > 0) {
    return resolveBomRequiredProcessIdentities({
      requiredProcessIds: processIds,
    });
  }
  const processNames = normalizeIdentityList(input.requiredProcesses);
  if (processNames.length === 0) return [];

  const idsByName = await MasterDataGovernanceKernel.resolveCanonicalIdsByNames(
    {
      configKey: 'processName',
      names: processNames,
    },
  );
  const requiredProcessIds = processNames.map((processName) => {
    const processId = String(idsByName.get(processName) || '').trim();
    if (!processId) {
      throw new BusinessError(
        'UNRESOLVED_CANONICAL_REFERENCE',
        `Process name cannot be resolved uniquely: ${processName}`,
      );
    }
    return processId;
  });
  return resolveBomRequiredProcessIdentities({ requiredProcessIds });
}

export async function buildBomImportGovernedFields(
  input: Record<string, unknown>,
) {
  const governedFields = buildGovernedWriteFieldsForTable(
    'project_boms',
    input,
  );
  const canonicalFields = await buildGovernedCanonicalWritePairForTable(
    'project_boms',
    governedFields,
    { mode: 'legacy-import' },
  );
  return { canonicalFields, governedFields };
}
