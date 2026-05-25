import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { getMasterDataGovernanceField } from '../core/master-data/governance-registry';

interface DerivedRule {
  fieldKey: string;
  frozenAt: string;
  matchingPriority: string[];
  sourceSql: string;
}

interface DerivedRulesConfig {
  rules: DerivedRule[];
  updatedAt: string;
  version: number;
}

const WAVE3_FIELDS = new Set(['partName', 'projectName']);

function normalizeSql(sql: string) {
  return String(sql || '')
    .trim()
    .replaceAll(/\s+/g, ' ')
    .replaceAll(/\(\s+/g, '(')
    .replaceAll(/\s+\)/g, ')');
}

function resolveBackendDir() {
  const cwd = process.cwd();
  const backendFromRoot = path.resolve(cwd, 'apps', 'backend');
  const apiPath = path.join(backendFromRoot, 'api');
  if (existsSync(apiPath)) {
    return backendFromRoot;
  }
  if (existsSync(path.join(cwd, 'api'))) {
    return cwd;
  }
  throw new TypeError('BACKEND_DIR_NOT_FOUND');
}

async function loadConfig(configPath: string) {
  const text = await fs.readFile(configPath, 'utf8');
  return JSON.parse(text) as DerivedRulesConfig;
}

function validateConfig(config: DerivedRulesConfig) {
  if (!Array.isArray(config.rules) || config.rules.length === 0) {
    throw new Error('INVALID_RULES: rules must be non-empty array');
  }
  const byKey = new Map(config.rules.map((rule) => [rule.fieldKey, rule]));
  for (const fieldKey of WAVE3_FIELDS) {
    const rule = byKey.get(fieldKey);
    if (!rule) {
      throw new Error(`MISSING_RULE:${fieldKey}`);
    }
    const normalizedSourceSql = String(rule.sourceSql || '').trim();
    if (!normalizedSourceSql) {
      throw new Error(`INVALID_RULE_SOURCE_SQL:${fieldKey}`);
    }
    const registryField = getMasterDataGovernanceField(fieldKey);
    const registrySourceSql =
      registryField?.source.type === 'derived'
        ? String(registryField.source.valueSql || '').trim()
        : '';
    if (!registrySourceSql) {
      throw new Error(`MISSING_REGISTRY_DERIVED_SOURCE:${fieldKey}`);
    }
    if (normalizeSql(registrySourceSql) !== normalizeSql(normalizedSourceSql)) {
      throw new Error(`DERIVED_SOURCE_SQL_MISMATCH:${fieldKey}`);
    }
    if (
      !Array.isArray(rule.matchingPriority) ||
      rule.matchingPriority.length === 0
    ) {
      throw new TypeError(`INVALID_RULE_PRIORITY:${fieldKey}`);
    }
    const frozenAt = Date.parse(String(rule.frozenAt || ''));
    if (Number.isNaN(frozenAt)) {
      throw new TypeError(`INVALID_RULE_FROZEN_AT:${fieldKey}`);
    }
  }
  return [...WAVE3_FIELDS].map((fieldKey) => byKey.get(fieldKey));
}

async function main() {
  const backendDir = resolveBackendDir();
  const configPath = path.resolve(
    backendDir,
    'config',
    'master-data-derived-rules.json',
  );
  const config = await loadConfig(configPath);
  const rules = validateConfig(config);

  const result = {
    configPath,
    frozenFields: rules.map((rule) => ({
      fieldKey: rule?.fieldKey,
      frozenAt: rule?.frozenAt,
      priorityCount: rule?.matchingPriority.length || 0,
    })),
    updatedAt: config.updatedAt,
    version: config.version,
  };

  console.warn('[check-master-data-derived-rules] result');
  console.warn(JSON.stringify(result, null, 2));
}

main().catch((error: unknown) => {
  console.error('[check-master-data-derived-rules] failed', error);
  process.exitCode = 1;
});
