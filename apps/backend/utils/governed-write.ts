import { BusinessError } from './business-error';
import { MasterDataGovernanceKernel } from './canonical-master-data';
import {
  getMasterDataGovernanceField,
  listMasterDataGovernanceFields,
} from './master-data-fields';

type GovernedWriteInput = Record<string, unknown>;
type GovernedFieldMapping = Record<string, string>;
export interface GovernedWriteHelperSpec {
  helperName: string;
  mappings: Array<{
    configKey: string;
    targetField: string;
  }>;
  targetTable: string;
}

export type GovernedCanonicalWritePair = Record<
  string,
  null | string | undefined
>;
export type GovernedCanonicalWriteMode = 'legacy-import' | 'online';

const TABLE_ALIAS_HELPER_NAME: Record<string, string> = {
  inspections: 'buildGovernedInspectionWriteFields',
  quality_records: 'buildGovernedQualityRecordWriteFields',
  qms_inspection_requests: 'buildGovernedInspectionRequestWriteFields',
  work_orders: 'buildGovernedWorkOrderWriteFields',
  after_sales: 'buildGovernedAfterSalesWriteFields',
  supervision_projects: 'buildGovernedSupervisionProjectWriteFields',
  vehicle_commissioning_issues:
    'buildGovernedVehicleCommissioningIssueWriteFields',
  quality_losses: 'buildGovernedQualityLossWriteFields',
  metrology_borrow_records: 'buildGovernedMetrologyBorrowWriteFields',
  welders: 'buildGovernedWelderWriteFields',
  inspection_form_templates: 'buildGovernedInspectionFormTemplateWriteFields',
  work_order_requirements: 'buildGovernedWorkOrderRequirementWriteFields',
  inspection_archive_tasks: 'buildGovernedInspectionArchiveTaskWriteFields',
};

function buildGovernedTableList() {
  const tableSet = new Set<string>();
  for (const field of listMasterDataGovernanceFields()) {
    for (const target of field.targets) {
      tableSet.add(target.table);
    }
  }
  return [...tableSet].sort((a, b) => a.localeCompare(b));
}

function buildGovernedFieldMappingByTable(tableName: string) {
  const resolvedEntries = new Map<
    string,
    {
      configKey: string;
      rolloutWave: number;
    }
  >();
  for (const field of listMasterDataGovernanceFields()) {
    for (const target of field.targets) {
      if (target.table !== tableName) continue;
      const targetField = target.nameColumn;
      const existing = resolvedEntries.get(targetField);
      if (!existing) {
        resolvedEntries.set(targetField, {
          configKey: field.key,
          rolloutWave: field.rolloutWave,
        });
        continue;
      }
      if (existing.configKey === field.key) {
        if (field.rolloutWave > existing.rolloutWave) {
          resolvedEntries.set(targetField, {
            configKey: field.key,
            rolloutWave: field.rolloutWave,
          });
        }
        continue;
      }
      if (field.rolloutWave > existing.rolloutWave) {
        resolvedEntries.set(targetField, {
          configKey: field.key,
          rolloutWave: field.rolloutWave,
        });
        continue;
      }
      if (field.rolloutWave === existing.rolloutWave) {
        throw new Error(
          `DUPLICATE_GOVERNED_MAPPING:${tableName}.${targetField}:${existing.configKey}->${field.key}`,
        );
      }
    }
  }
  const mapping: GovernedFieldMapping = {};
  for (const [targetField, resolved] of resolvedEntries.entries()) {
    mapping[targetField] = resolved.configKey;
  }
  return mapping;
}

const GOVERNED_FIELD_MAPPING_BY_TABLE = new Map<string, GovernedFieldMapping>(
  buildGovernedTableList().map((table) => [
    table,
    buildGovernedFieldMappingByTable(table),
  ]),
);

function normalizeGovernedNameValue(value: unknown) {
  if (value === undefined) {
    return undefined;
  }
  const normalized = String(value || '').trim();
  return normalized || null;
}

function buildGovernedWriteFields(
  input: GovernedWriteInput,
  mapping: GovernedFieldMapping,
) {
  const output: Record<string, null | string> = {};
  for (const [targetField, configKey] of Object.entries(mapping)) {
    const config = getMasterDataGovernanceField(configKey);
    if (!config) {
      throw new Error(`INVALID_GOVERNANCE_CONFIG:${configKey}`);
    }
    const normalized = normalizeGovernedNameValue(input[targetField]);
    if (normalized !== undefined) {
      output[targetField] = normalized;
    }
  }
  return output;
}

function buildGovernedWriteFieldsByTable(
  input: GovernedWriteInput,
  targetTable: string,
) {
  const mapping = GOVERNED_FIELD_MAPPING_BY_TABLE.get(targetTable);
  if (!mapping) {
    throw new Error(`UNKNOWN_GOVERNED_TARGET_TABLE:${targetTable}`);
  }
  return buildGovernedWriteFields(input, mapping);
}

export function buildGovernedWriteFieldsForTable(
  targetTable: string,
  input: GovernedWriteInput,
) {
  return buildGovernedWriteFieldsByTable(input, targetTable);
}

export function buildGovernedInspectionWriteFields(input: GovernedWriteInput) {
  return buildGovernedWriteFieldsByTable(input, 'inspections');
}

export function buildGovernedQualityRecordWriteFields(
  input: GovernedWriteInput,
) {
  return buildGovernedWriteFieldsByTable(input, 'quality_records');
}

export function buildGovernedInspectionRequestWriteFields(
  input: GovernedWriteInput,
) {
  return buildGovernedWriteFieldsByTable(input, 'qms_inspection_requests');
}

export function buildGovernedWorkOrderWriteFields(input: GovernedWriteInput) {
  return buildGovernedWriteFieldsByTable(input, 'work_orders');
}

export function buildGovernedAfterSalesWriteFields(input: GovernedWriteInput) {
  return buildGovernedWriteFieldsByTable(input, 'after_sales');
}

export function buildGovernedSupervisionProjectWriteFields(
  input: GovernedWriteInput,
) {
  return buildGovernedWriteFieldsByTable(input, 'supervision_projects');
}

export function buildGovernedVehicleCommissioningIssueWriteFields(
  input: GovernedWriteInput,
) {
  return buildGovernedWriteFieldsByTable(input, 'vehicle_commissioning_issues');
}

export function buildGovernedQualityLossWriteFields(input: GovernedWriteInput) {
  return buildGovernedWriteFieldsByTable(input, 'quality_losses');
}

export function buildGovernedMetrologyBorrowWriteFields(
  input: GovernedWriteInput,
) {
  return buildGovernedWriteFieldsByTable(input, 'metrology_borrow_records');
}

export function buildGovernedWelderWriteFields(input: GovernedWriteInput) {
  return buildGovernedWriteFieldsByTable(input, 'welders');
}

export function buildGovernedInspectionFormTemplateWriteFields(
  input: GovernedWriteInput,
) {
  return buildGovernedWriteFieldsByTable(input, 'inspection_form_templates');
}

export function buildGovernedWorkOrderRequirementWriteFields(
  input: GovernedWriteInput,
) {
  return buildGovernedWriteFieldsByTable(input, 'work_order_requirements');
}

export function buildGovernedInspectionArchiveTaskWriteFields(
  input: GovernedWriteInput,
) {
  return buildGovernedWriteFieldsByTable(input, 'inspection_archive_tasks');
}

function toSpecMappings(mapping: GovernedFieldMapping) {
  return Object.entries(mapping).map(([targetField, configKey]) => ({
    targetField,
    configKey,
  }));
}

export function listGovernedWriteHelperSpecs(): GovernedWriteHelperSpec[] {
  return [...GOVERNED_FIELD_MAPPING_BY_TABLE.keys()].map((targetTable) => ({
    helperName:
      TABLE_ALIAS_HELPER_NAME[targetTable] ||
      `buildGovernedWriteFieldsForTable(${targetTable})`,
    targetTable,
    mappings: toSpecMappings(
      GOVERNED_FIELD_MAPPING_BY_TABLE.get(targetTable) || {},
    ),
  }));
}

function normalizeCanonicalIdValue(value: unknown) {
  if (value === undefined) return undefined;
  const normalized = String(value || '').trim();
  return normalized || null;
}

function extractCanonicalTargetByField(
  targetTable: string,
  mappings: GovernedFieldMapping,
) {
  const outputs: Array<{
    configKey: string;
    idField: string;
    nameField: string;
  }> = [];
  for (const [nameField, configKey] of Object.entries(mappings)) {
    const field = getMasterDataGovernanceField(configKey);
    if (!field?.canonical) continue;
    const target = field.targets.find(
      (item) => item.table === targetTable && item.nameColumn === nameField,
    );
    if (!target?.idColumn) continue;
    outputs.push({
      configKey,
      idField: target.idColumn,
      nameField,
    });
  }
  return outputs;
}

export async function buildGovernedCanonicalWritePairForTable(
  targetTable: string,
  input: GovernedWriteInput,
  options: { mode?: GovernedCanonicalWriteMode } = {},
): Promise<GovernedCanonicalWritePair> {
  const mapping = GOVERNED_FIELD_MAPPING_BY_TABLE.get(targetTable);
  if (!mapping) {
    throw new Error(`UNKNOWN_GOVERNED_TARGET_TABLE:${targetTable}`);
  }
  const output: GovernedCanonicalWritePair = {};
  const canonicalTargets = extractCanonicalTargetByField(targetTable, mapping);
  const mode = options.mode || 'online';
  for (const target of canonicalTargets) {
    const field = getMasterDataGovernanceField(target.configKey);
    if (!field) {
      throw new Error(`INVALID_GOVERNANCE_CONFIG:${target.configKey}`);
    }
    const explicitCanonicalId = normalizeCanonicalIdValue(
      input[target.idField],
    );
    let governedName = normalizeGovernedNameValue(input[target.nameField]);
    if (
      field.onlineWritePolicy === 'id-required' &&
      mode === 'online' &&
      governedName &&
      !explicitCanonicalId
    ) {
      throw new BusinessError(
        'CANONICAL_ID_REQUIRED',
        `${target.idField} is required when ${target.nameField} is provided`,
      );
    }
    let inferredCanonicalId: null | string | undefined;
    if (explicitCanonicalId === undefined && governedName) {
      const canonicalName =
        await MasterDataGovernanceKernel.resolveCanonicalNameById({
          configKey: target.configKey,
          canonicalId: governedName,
          fallbackName: null,
        });
      if (canonicalName) {
        inferredCanonicalId = governedName;
        governedName = canonicalName;
        output[target.nameField] = canonicalName;
      }
    }
    const resolvedCanonicalId =
      await MasterDataGovernanceKernel.resolveCanonicalIdForWrite({
        configKey: target.configKey,
        explicitCanonicalId: explicitCanonicalId ?? inferredCanonicalId,
        keepExistingWhenNameMissing: true,
        name: governedName,
      });
    if (resolvedCanonicalId !== undefined) {
      output[target.idField] = resolvedCanonicalId;
    }
    if (
      field.onlineWritePolicy === 'id-required' &&
      mode === 'legacy-import' &&
      governedName &&
      !resolvedCanonicalId
    ) {
      throw new BusinessError(
        'UNRESOLVED_CANONICAL_REFERENCE',
        `${target.nameField} cannot be resolved to a unique canonical ID`,
      );
    }
    if (resolvedCanonicalId) {
      const canonicalName =
        await MasterDataGovernanceKernel.resolveCanonicalNameById({
          canonicalId: resolvedCanonicalId,
          configKey: target.configKey,
          fallbackName: null,
        });
      if (canonicalName) {
        output[target.nameField] = canonicalName;
      }
    }
  }
  return output;
}
