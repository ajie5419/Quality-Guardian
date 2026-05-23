import type { GovernedWriteHelperSpec } from '../utils/master-data-governance-write';

import process from 'node:process';

import { listMasterDataGovernanceFields } from '../utils/master-data-governance-registry';
import { listGovernedWriteHelperSpecs } from '../utils/master-data-governance-write';

interface HelperFieldIssue {
  configKey: string;
  helperName: string;
  reason:
    | 'mapping-config-key-not-registered'
    | 'mapping-target-column-not-in-registry'
    | 'mapping-target-table-not-in-registry';
  tableName?: string;
  targetColumn: string;
}

interface RegistryFieldIssue {
  configKey: string;
  reason: 'registered-target-not-covered-by-any-helper';
  tableName: string;
  targetColumn: string;
}

function buildRegistryTargetIndex() {
  const byConfigKey = new Map<string, Set<string>>();
  for (const field of listMasterDataGovernanceFields()) {
    const entry = byConfigKey.get(field.key) || new Set<string>();
    for (const target of field.targets) {
      entry.add(`${target.table}::${target.nameColumn}`);
    }
    byConfigKey.set(field.key, entry);
  }
  return byConfigKey;
}

function buildHelperCoverageIndex(helperSpecs: GovernedWriteHelperSpec[]) {
  const byConfigKey = new Map<string, Set<string>>();
  for (const spec of helperSpecs) {
    for (const mapping of spec.mappings) {
      const entry = byConfigKey.get(mapping.configKey) || new Set<string>();
      entry.add(`${spec.targetTable}::${mapping.targetField}`);
      byConfigKey.set(mapping.configKey, entry);
    }
  }
  return byConfigKey;
}

function collectHelperIssues(
  helperSpecs: GovernedWriteHelperSpec[],
  registryIndex: Map<string, Set<string>>,
) {
  const issues: HelperFieldIssue[] = [];
  for (const spec of helperSpecs) {
    for (const mapping of spec.mappings) {
      const registeredTargets = registryIndex.get(mapping.configKey);
      if (!registeredTargets) {
        issues.push({
          helperName: spec.helperName,
          configKey: mapping.configKey,
          targetColumn: mapping.targetField,
          reason: 'mapping-config-key-not-registered',
          tableName: spec.targetTable,
        });
        continue;
      }
      const targetRef = `${spec.targetTable}::${mapping.targetField}`;
      const hasAnySameColumn = [...registeredTargets].some((item) =>
        item.endsWith(`::${mapping.targetField}`),
      );
      if (!hasAnySameColumn) {
        issues.push({
          helperName: spec.helperName,
          configKey: mapping.configKey,
          targetColumn: mapping.targetField,
          reason: 'mapping-target-column-not-in-registry',
          tableName: spec.targetTable,
        });
        continue;
      }
      if (!registeredTargets.has(targetRef)) {
        issues.push({
          helperName: spec.helperName,
          configKey: mapping.configKey,
          targetColumn: mapping.targetField,
          reason: 'mapping-target-table-not-in-registry',
          tableName: spec.targetTable,
        });
      }
    }
  }
  return issues;
}

function collectRegistryCoverageIssues(
  helperCoverageIndex: Map<string, Set<string>>,
  registryIndex: Map<string, Set<string>>,
) {
  const issues: RegistryFieldIssue[] = [];
  for (const [configKey, targets] of registryIndex.entries()) {
    const covered = helperCoverageIndex.get(configKey) || new Set<string>();
    for (const target of targets) {
      if (covered.has(target)) continue;
      const [tableName, targetColumn] = target.split('::');
      issues.push({
        configKey,
        tableName,
        targetColumn,
        reason: 'registered-target-not-covered-by-any-helper',
      });
    }
  }
  return issues;
}

async function main() {
  const helperSpecs = listGovernedWriteHelperSpecs();
  const registryIndex = buildRegistryTargetIndex();
  const helperIssues = collectHelperIssues(helperSpecs, registryIndex);
  const coverageIndex = buildHelperCoverageIndex(helperSpecs);
  const registryCoverageIssues = collectRegistryCoverageIssues(
    coverageIndex,
    registryIndex,
  );

  const summary = {
    generatedAt: new Date().toISOString(),
    totals: {
      helperIssues: helperIssues.length,
      helperSpecs: helperSpecs.length,
      registryCoverageIssues: registryCoverageIssues.length,
      registryFields: registryIndex.size,
    },
    helperIssues,
    registryCoverageIssues,
  };

  console.warn('[check-master-data-helper-alignment] result');
  console.warn(JSON.stringify(summary, null, 2));

  if (
    summary.totals.helperIssues > 0 ||
    summary.totals.registryCoverageIssues > 0
  ) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error('[check-master-data-helper-alignment] failed', error);
  process.exitCode = 1;
});
