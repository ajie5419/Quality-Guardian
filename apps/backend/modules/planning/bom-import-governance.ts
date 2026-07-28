import {
  buildGovernedCanonicalWritePairForTable,
  buildGovernedWriteFieldsForTable,
} from '~/utils/governed-write';

import { resolveBomRequiredProcessIdentities } from './bom-process-identities';

/** Legacy BOM files may resolve exact names because they predate canonical IDs. */
export async function resolveBomImportProcessIdentities(
  input: Record<string, unknown>,
) {
  return resolveBomRequiredProcessIdentities(input, 'legacy-import');
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
