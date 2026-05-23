import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ALLOWED_HELPER_EXPORTS = new Set([
  'buildGovernedAfterSalesWriteFields',
  'buildGovernedInspectionArchiveTaskWriteFields',
  'buildGovernedInspectionFormTemplateWriteFields',
  'buildGovernedInspectionRequestWriteFields',
  'buildGovernedInspectionWriteFields',
  'buildGovernedMetrologyBorrowWriteFields',
  'buildGovernedQualityLossWriteFields',
  'buildGovernedQualityRecordWriteFields',
  'buildGovernedSupervisionProjectWriteFields',
  'buildGovernedVehicleCommissioningIssueWriteFields',
  'buildGovernedWelderWriteFields',
  'buildGovernedWorkOrderRequirementWriteFields',
  'buildGovernedWorkOrderWriteFields',
]);
const REQUIRED_HELPER_EXPORTS = new Set([
  'buildGovernedWriteFieldsForTable',
  ...ALLOWED_HELPER_EXPORTS,
]);

function resolveWriteHelperPath() {
  const cwd = process.cwd();
  const backendFromRoot = path.resolve(
    cwd,
    'apps',
    'backend',
    'utils',
    'master-data-governance-write.ts',
  );
  if (fs.existsSync(backendFromRoot)) {
    return backendFromRoot;
  }
  const backendFromCwd = path.resolve(
    cwd,
    'utils',
    'master-data-governance-write.ts',
  );
  if (fs.existsSync(backendFromCwd)) {
    return backendFromCwd;
  }
  throw new Error('WRITE_HELPER_FILE_NOT_FOUND');
}

function parseHelperExports(sourceText: string) {
  const exportNames = [
    ...sourceText.matchAll(/export function (buildGoverned\w+)\s*\(/g),
  ].map((match) => String(match[1] || '').trim());
  return [...new Set(exportNames)].sort((a, b) => a.localeCompare(b));
}

async function main() {
  const filePath = resolveWriteHelperPath();
  const sourceText = fs.readFileSync(filePath, 'utf8');
  const exports = parseHelperExports(sourceText);
  const missingRequiredExports = [...REQUIRED_HELPER_EXPORTS]
    .filter((name) => !exports.includes(name))
    .sort((a, b) => a.localeCompare(b));
  const unexpectedSpecializedExports = exports
    .filter(
      (name) =>
        /^buildGoverned\w+WriteFields$/u.test(name) &&
        !ALLOWED_HELPER_EXPORTS.has(name),
    )
    .sort((a, b) => a.localeCompare(b));

  const summary = {
    filePath,
    totals: {
      allowedHelperExports: ALLOWED_HELPER_EXPORTS.size,
      currentHelperExports: exports.length,
      missingRequiredExports: missingRequiredExports.length,
      unexpectedSpecializedExports: unexpectedSpecializedExports.length,
    },
    exports,
    missingRequiredExports,
    unexpectedSpecializedExports,
    guidance:
      'Use buildGovernedWriteFieldsForTable(targetTable, input) for new write targets instead of adding new specialized helper exports. Keep generic helper export available.',
  };

  console.warn('[check-master-data-helper-surface] result');
  console.warn(JSON.stringify(summary, null, 2));

  if (
    missingRequiredExports.length > 0 ||
    unexpectedSpecializedExports.length > 0
  ) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error('[check-master-data-helper-surface] failed', error);
  process.exitCode = 1;
});
