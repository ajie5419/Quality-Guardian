import {
  buildGovernedCanonicalWritePairForTable,
  buildGovernedWriteFieldsForTable,
} from '~/utils/governed-write';

/** Legacy imports may resolve exact names because source files predate canonical IDs. */
export async function buildWorkOrderImportGovernedFields(
  input: Record<string, unknown>,
) {
  const governedFields = buildGovernedWriteFieldsForTable('work_orders', input);
  const canonicalFields = await buildGovernedCanonicalWritePairForTable(
    'work_orders',
    input,
    { mode: 'legacy-import' },
  );
  return { ...governedFields, ...canonicalFields };
}
