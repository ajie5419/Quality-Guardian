import prisma from '~/utils/prisma';

export interface RenameTarget {
  model: string;
  field: string;
  nullable: boolean;
}

export interface RenameConfig {
  key: string;
  dictionaryType?: null | string;
  sourceType: 'department' | 'dictionary' | 'supplier' | 'workOrderDivision';
  targets: RenameTarget[];
}

export interface RenameRequest {
  configKey: string;
  dryRun?: boolean;
  newValue: string;
  oldValue: string;
}

export interface RenameResult {
  affectedRows: number;
  field: string;
  model: string;
}

export interface MasterDataOrphanItem {
  configKey: string;
  count: number;
  tables: string[];
  value: string;
}

type CountRow = { count: bigint | number | string };
type DistinctValueRow = { value: null | string };
type ValueCountRow = { count: bigint | number | string; value: null | string };

type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

const MASTER_DATA_RENAME_CONFIGS = {
  processName: {
    key: 'processName',
    dictionaryType: 'inspection_process_name',
    sourceType: 'dictionary',
    targets: [
      { model: 'inspections', field: 'processName', nullable: true },
      { model: 'quality_records', field: 'processName', nullable: true },
      {
        model: 'work_order_requirements',
        field: 'processName',
        nullable: true,
      },
      {
        model: 'qms_inspection_requests',
        field: 'processName',
        nullable: false,
      },
      {
        model: 'inspection_form_templates',
        field: 'processName',
        nullable: false,
      },
    ],
  },
  responsibleDepartment: {
    key: 'responsibleDepartment',
    dictionaryType: null,
    sourceType: 'department',
    targets: [
      {
        model: 'quality_records',
        field: 'responsibleDepartment',
        nullable: false,
      },
      {
        model: 'vehicle_commissioning_issues',
        field: 'responsibleDepartment',
        nullable: true,
      },
      { model: 'after_sales', field: 'respDept', nullable: true },
      { model: 'quality_losses', field: 'respDept', nullable: true },
      {
        model: 'metrology_borrow_records',
        field: 'borrowerDepartment',
        nullable: false,
      },
    ],
  },
  supplierName: {
    key: 'supplierName',
    dictionaryType: null,
    sourceType: 'supplier',
    targets: [
      { model: 'inspections', field: 'supplierName', nullable: true },
      { model: 'quality_records', field: 'supplierName', nullable: true },
      { model: 'supervision_projects', field: 'supplierName', nullable: true },
    ],
  },
  division: {
    key: 'division',
    dictionaryType: null,
    sourceType: 'workOrderDivision',
    targets: [
      { model: 'quality_records', field: 'division', nullable: true },
      { model: 'after_sales', field: 'division', nullable: true },
      { model: 'work_orders', field: 'division', nullable: true },
    ],
  },
  defectType: {
    key: 'defectType',
    dictionaryType: 'defect_type',
    sourceType: 'dictionary',
    targets: [
      { model: 'quality_records', field: 'defectType', nullable: true },
      { model: 'after_sales', field: 'defectType', nullable: true },
    ],
  },
  defectSubtype: {
    key: 'defectSubtype',
    dictionaryType: 'defect_subtype',
    sourceType: 'dictionary',
    targets: [
      { model: 'quality_records', field: 'defectSubtype', nullable: true },
      { model: 'after_sales', field: 'defectSubtype', nullable: true },
    ],
  },
  team: {
    key: 'team',
    dictionaryType: 'team',
    sourceType: 'dictionary',
    targets: [
      { model: 'inspections', field: 'team', nullable: true },
      { model: 'qms_inspection_requests', field: 'team', nullable: true },
      { model: 'welders', field: 'team', nullable: false },
    ],
  },
} as const;

type MasterDataConfigKey = keyof typeof MASTER_DATA_RENAME_CONFIGS;
type RenameConfigMap = Record<MasterDataConfigKey, RenameConfig>;

const RENAME_CONFIGS: RenameConfigMap =
  MASTER_DATA_RENAME_CONFIGS as unknown as RenameConfigMap;

function normalizeValue(value: unknown) {
  return String(value || '').trim();
}

function quoteIdentifier(value: string) {
  if (!/^[_a-z]\w*$/i.test(value)) {
    throw new Error(`UNSAFE_IDENTIFIER:${value}`);
  }
  return `\`${value}\``;
}

function toAffectedRows(value: bigint | number | string | undefined) {
  if (typeof value === 'bigint') {
    return Number(value);
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === 'string' && value.length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function getConfig(configKey: string): RenameConfig {
  const normalizedKey = normalizeValue(configKey) as MasterDataConfigKey;
  const config = RENAME_CONFIGS[normalizedKey];
  if (!config) {
    throw new Error('INVALID_CONFIG_KEY');
  }
  return config;
}

async function queryExactMatchCount(
  tx: TxClient,
  model: string,
  field: string,
  value: string,
) {
  const modelName = quoteIdentifier(model);
  const fieldName = quoteIdentifier(field);
  const rows = await tx.$queryRawUnsafe<CountRow[]>(
    `SELECT COUNT(1) AS count FROM ${modelName} WHERE ${fieldName} = ?`,
    value,
  );
  return toAffectedRows(rows[0]?.count);
}

async function fetchSourceValues(config: RenameConfig) {
  const values = new Set<string>();

  if (config.sourceType === 'dictionary') {
    if (!config.dictionaryType) {
      return values;
    }
    const rows = await prisma.$queryRawUnsafe<
      Array<{ key: string; value: string }>
    >(
      `SELECT dictKey AS \`key\`, dictValue AS value
       FROM dictionaries
       WHERE isDeleted = 0 AND status = 1 AND dictType = ?`,
      config.dictionaryType,
    );
    for (const row of rows) {
      const key = normalizeValue(row.key);
      const value = normalizeValue(row.value);
      if (key) values.add(key);
      if (value) values.add(value);
    }
    return values;
  }

  if (config.sourceType === 'supplier') {
    const rows = await prisma.$queryRawUnsafe<DistinctValueRow[]>(
      `SELECT DISTINCT name AS value
       FROM suppliers
       WHERE isDeleted = 0`,
    );
    for (const row of rows) {
      const value = normalizeValue(row.value);
      if (value) values.add(value);
    }
    return values;
  }

  if (config.sourceType === 'department') {
    const rows = await prisma.$queryRawUnsafe<DistinctValueRow[]>(
      `SELECT DISTINCT name AS value
       FROM departments
       WHERE isDeleted = 0`,
    );
    for (const row of rows) {
      const value = normalizeValue(row.value);
      if (value) values.add(value);
    }
    return values;
  }

  const rows = await prisma.$queryRawUnsafe<DistinctValueRow[]>(
    `SELECT DISTINCT division AS value
     FROM work_orders
     WHERE isDeleted = 0 AND division IS NOT NULL AND TRIM(division) <> ''`,
  );
  for (const row of rows) {
    const value = normalizeValue(row.value);
    if (value) values.add(value);
  }
  return values;
}

export const MasterDataRenameService = {
  isConfigKey(configKey: string) {
    return Boolean(
      RENAME_CONFIGS[normalizeValue(configKey) as MasterDataConfigKey],
    );
  },

  async rename(request: RenameRequest): Promise<RenameResult[]> {
    const config = getConfig(request.configKey);
    const oldValue = normalizeValue(request.oldValue);
    const newValue = normalizeValue(request.newValue);
    const dryRun = Boolean(request.dryRun);

    if (!oldValue) {
      throw new Error('VALIDATION:oldValue 不能为空');
    }
    if (!newValue) {
      throw new Error('VALIDATION:newValue 不能为空');
    }
    if (oldValue === newValue) {
      throw new Error('VALIDATION:oldValue 与 newValue 不能相同');
    }

    return prisma.$transaction(async (tx) => {
      const results: RenameResult[] = [];

      for (const target of config.targets) {
        if (dryRun) {
          const count = await queryExactMatchCount(
            tx,
            target.model,
            target.field,
            oldValue,
          );
          results.push({
            model: target.model,
            field: target.field,
            affectedRows: count,
          });
          continue;
        }

        const modelName = quoteIdentifier(target.model);
        const fieldName = quoteIdentifier(target.field);
        const affectedRows = await tx.$executeRawUnsafe(
          `UPDATE ${modelName} SET ${fieldName} = ? WHERE ${fieldName} = ?`,
          newValue,
          oldValue,
        );
        results.push({
          model: target.model,
          field: target.field,
          affectedRows: toAffectedRows(affectedRows),
        });
      }

      if (config.dictionaryType) {
        if (dryRun) {
          const rows = await tx.$queryRawUnsafe<CountRow[]>(
            `SELECT COUNT(1) AS count
             FROM dictionaries
             WHERE isDeleted = 0
               AND dictType = ?
               AND (dictKey = ? OR dictValue = ?)`,
            config.dictionaryType,
            oldValue,
            oldValue,
          );
          results.push({
            model: 'dictionaries',
            field: 'dictKey,dictValue',
            affectedRows: toAffectedRows(rows[0]?.count),
          });
        } else {
          const affectedRows = await tx.$executeRawUnsafe(
            `UPDATE dictionaries
             SET dictKey = ?, dictValue = ?
             WHERE isDeleted = 0
               AND dictType = ?
               AND (dictKey = ? OR dictValue = ?)`,
            newValue,
            newValue,
            config.dictionaryType,
            oldValue,
            oldValue,
          );
          results.push({
            model: 'dictionaries',
            field: 'dictKey,dictValue',
            affectedRows: toAffectedRows(affectedRows),
          });
        }
      }

      if (config.key === 'supplierName') {
        if (dryRun) {
          const count = await queryExactMatchCount(
            tx,
            'suppliers',
            'name',
            oldValue,
          );
          results.push({
            model: 'suppliers',
            field: 'name',
            affectedRows: count,
          });
        } else {
          const affectedRows = await tx.$executeRawUnsafe(
            `UPDATE suppliers
             SET name = ?
             WHERE isDeleted = 0 AND name = ?`,
            newValue,
            oldValue,
          );
          results.push({
            model: 'suppliers',
            field: 'name',
            affectedRows: toAffectedRows(affectedRows),
          });
        }
      }

      if (config.key === 'responsibleDepartment') {
        if (dryRun) {
          const count = await queryExactMatchCount(
            tx,
            'departments',
            'name',
            oldValue,
          );
          results.push({
            model: 'departments',
            field: 'name',
            affectedRows: count,
          });
        } else {
          const affectedRows = await tx.$executeRawUnsafe(
            `UPDATE departments
             SET name = ?
             WHERE isDeleted = 0 AND name = ?`,
            newValue,
            oldValue,
          );
          results.push({
            model: 'departments',
            field: 'name',
            affectedRows: toAffectedRows(affectedRows),
          });
        }
      }

      return results;
    });
  },

  async audit(): Promise<MasterDataOrphanItem[]> {
    const orphanMap = new Map<
      string,
      { configKey: string; count: number; tables: Set<string>; value: string }
    >();

    const configs = Object.values(RENAME_CONFIGS);
    for (const config of configs) {
      const sourceValues = await fetchSourceValues(config);

      for (const target of config.targets) {
        const modelName = quoteIdentifier(target.model);
        const fieldName = quoteIdentifier(target.field);
        const rows = await prisma.$queryRawUnsafe<ValueCountRow[]>(
          `SELECT ${fieldName} AS value, COUNT(1) AS count
           FROM ${modelName}
           WHERE ${fieldName} IS NOT NULL AND TRIM(${fieldName}) <> ''
           GROUP BY ${fieldName}`,
        );

        for (const row of rows) {
          const value = normalizeValue(row.value);
          if (!value || sourceValues.has(value)) {
            continue;
          }

          const mapKey = `${config.key}::${value}`;
          const existing = orphanMap.get(mapKey);
          if (existing) {
            existing.count += toAffectedRows(row.count);
            existing.tables.add(target.model);
            continue;
          }

          orphanMap.set(mapKey, {
            configKey: config.key,
            value,
            tables: new Set([target.model]),
            count: toAffectedRows(row.count),
          });
        }
      }
    }

    return [...orphanMap.values()]
      .map((item) => ({
        configKey: item.configKey,
        value: item.value,
        tables: [...item.tables].sort(),
        count: item.count,
      }))
      .sort((a, b) => {
        if (a.configKey !== b.configKey) {
          return a.configKey.localeCompare(b.configKey);
        }
        if (a.count !== b.count) {
          return b.count - a.count;
        }
        return a.value.localeCompare(b.value);
      });
  },
};
