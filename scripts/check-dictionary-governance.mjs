import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SHARED_DICT_FILE = path.join(
  ROOT,
  'packages/qgs-shared/src/modules/qms/dictionary.ts',
);
const BACKEND_SERVICE_FILE = path.join(
  ROOT,
  'apps/backend/services/dictionary.service.ts',
);
const MIGRATION_FILE = path.join(
  ROOT,
  'apps/backend/prisma/migrate-dictionaries.mjs',
);
const WEB_QMS_DIR = path.join(ROOT, 'apps/web-antd/src/views/qms');

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function unique(values) {
  return [...new Set(values)];
}

function parseQuotedValues(text) {
  const result = [];
  const regex = /'([^']+)'/g;
  let match = regex.exec(text);
  while (match) {
    result.push(match[1]);
    match = regex.exec(text);
  }
  return result;
}

function parseSharedDictionaryTypes() {
  const content = read(SHARED_DICT_FILE);
  const match = content.match(
    /QMS_DICTIONARY_TYPES\s*=\s*\[([\s\S]*?)\]\s*as const/,
  );
  if (!match) {
    throw new Error('Cannot parse QMS_DICTIONARY_TYPES');
  }
  return unique(parseQuotedValues(match[1]));
}

function parseBackendSupportedTypes() {
  const content = read(BACKEND_SERVICE_FILE);
  if (
    !content.includes('QMS_DICTIONARY_TYPES') ||
    !content.includes('SUPPORTED_DICT_TYPES = new Set')
  ) {
    throw new Error(
      'DictionaryService must use QMS_DICTIONARY_TYPES as single source',
    );
  }
  return parseSharedDictionaryTypes();
}

function parseMigrationDictTypes() {
  const content = read(MIGRATION_FILE);
  const dictTypeMatches = content.match(/dictType:\s*'[^']+'/g) || [];
  return unique(dictTypeMatches.map((item) => item.split("'")[1]));
}

function parseFrontendUsedTypes() {
  const files = [];
  function walk(dir) {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        walk(full);
        continue;
      }
      if (!full.endsWith('.ts') && !full.endsWith('.vue')) continue;
      files.push(full);
    }
  }
  walk(WEB_QMS_DIR);

  const used = [];
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    const literalMatches = content.match(/dictType:\s*'([^']+)'/g) || [];
    for (const match of literalMatches) {
      used.push(match.split("'")[1]);
    }
    const keyMatches =
      content.match(/dictType:\s*QMS_DICTIONARY_TYPE_KEYS\.(\w+)/g) || [];
    for (const match of keyMatches) {
      const key = match.split('.').pop();
      if (!key) continue;
      used.push(
        {
          afterSalesStatus: 'after_sales_status',
          componentName: 'component_name',
          incomingType: 'incoming_type',
          inspectionIssueStatus: 'inspection_issue_status',
          inspectionProcessName: 'inspection_process_name',
          metrologyInspectionStatus: 'metrology_inspection_status',
          materialName: 'material_name',
          planningProjectStatus: 'planning_project_status',
          qualityLossStatus: 'quality_loss_status',
          qualityLossType: 'quality_loss_type',
          requirementName: 'requirement_name',
          supplierStatus: 'supplier_status',
          supervisionIssueStatus: 'supervision_issue_status',
          supervisionProjectStatus: 'supervision_project_status',
        }[key] || '',
      );
    }
  }
  return unique(used.filter(Boolean));
}

function checkFrontendMapperUsage() {
  const files = [];
  function walk(dir) {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        walk(full);
        continue;
      }
      if (!full.endsWith('.ts') && !full.endsWith('.vue')) continue;
      files.push(full);
    }
  }
  walk(WEB_QMS_DIR);

  const issues = [];
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    if (!content.includes('useDictionaryOptions')) continue;

    if (content.includes('options && options.length > 0')) {
      const rel = path.relative(ROOT, file);
      issues.push(
        `Do not branch on dictionary options length in mapOptions; delegate fallback to mapDictionaryOptions* helper: ${rel}`,
      );
    }

    const parts = content.split('mapOptions:');
    for (const part of parts.slice(1)) {
      const segment = part.slice(0, 260);
      if (segment.includes('mapDictionaryOptions')) continue;
      if (!/options\.map\(/.test(segment) && !/item\.dictValue/.test(segment)) {
        continue;
      }
      const rel = path.relative(ROOT, file);
      issues.push(
        `Frontend dictionary mapOptions must use mapDictionaryOptions* helper: ${rel}`,
      );
      break;
    }
  }
  return issues;
}

function diff(source, target) {
  return source.filter((item) => !target.includes(item));
}

function main() {
  const shared = parseSharedDictionaryTypes();
  const backend = parseBackendSupportedTypes();
  const migration = parseMigrationDictTypes();
  const frontendUsed = parseFrontendUsedTypes();

  const missingInMigration = diff(shared, migration);
  const extraInMigration = diff(migration, shared);
  const missingInSharedForFrontend = diff(frontendUsed, shared);
  const missingInMigrationForFrontend = diff(frontendUsed, migration);
  const backendNotShared = diff(backend, shared);
  const frontendMapperIssues = checkFrontendMapperUsage();

  const issues = [];
  if (missingInMigration.length > 0) {
    issues.push(
      `Missing dict types in migration seeds: ${missingInMigration.join(', ')}`,
    );
  }
  if (extraInMigration.length > 0) {
    issues.push(
      `Extra dict types in migration not in shared whitelist: ${extraInMigration.join(', ')}`,
    );
  }
  if (missingInSharedForFrontend.length > 0) {
    issues.push(
      `Frontend uses dict types not in shared whitelist: ${missingInSharedForFrontend.join(', ')}`,
    );
  }
  if (missingInMigrationForFrontend.length > 0) {
    issues.push(
      `Frontend uses dict types not seeded in migration: ${missingInMigrationForFrontend.join(', ')}`,
    );
  }
  if (backendNotShared.length > 0) {
    issues.push(
      `Backend supported dict types drift from shared whitelist: ${backendNotShared.join(', ')}`,
    );
  }
  if (frontendMapperIssues.length > 0) {
    issues.push(...frontendMapperIssues);
  }

  if (issues.length > 0) {
    console.error('[dict-governance] FAIL');
    for (const issue of issues) {
      console.error(`- ${issue}`);
    }
    process.exit(1);
  }

  console.log(
    `[dict-governance] PASS shared=${shared.length} frontendUsed=${frontendUsed.length} migrationSeeded=${migration.length}`,
  );
}

main();
