import type { MasterDataGovernanceField } from '../core/master-data/governance-registry';

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import {
  getMasterDataGovernanceField,
  getMasterDataGovernanceFieldKeys,
  listMasterDataGovernanceFieldsByWave,
  listMasterDataGovernanceWaves,
} from '../core/master-data/governance-registry';

function normalizeArgs(argv: string[]) {
  const args = new Map<string, string>();
  for (const item of argv) {
    if (!item.startsWith('--')) continue;
    const [key, value = ''] = item.slice(2).split('=');
    args.set(key, value);
  }
  return args;
}

function slugify(input: string) {
  return input
    .replaceAll(/([a-z])([A-Z])/g, '$1-$2')
    .replaceAll('_', '-')
    .toLowerCase();
}

function resolveRepoRoot() {
  const cwd = process.cwd();
  const backendSuffix = `${path.sep}apps${path.sep}backend`;
  if (cwd.endsWith(backendSuffix)) {
    return path.resolve(cwd, '..', '..');
  }
  return cwd;
}

function renderMigrationTemplate(field: MasterDataGovernanceField) {
  const canonical = field.canonical;
  const canonicalTable = canonical?.table || '<canonical_table>';
  const canonicalIdColumn = canonical?.idColumn || 'id';
  const migrationTargets = field.targets.filter((item) =>
    Boolean(item.idColumn),
  );
  if (migrationTargets.length === 0) {
    return `-- master-data governance migration template for ${field.key}
-- This field currently uses name-only strategy and has no canonical id column migration.
-- Keep this file as an explicit no-op checkpoint for release evidence.
`;
  }

  const lines = [
    `-- master-data governance migration template for ${field.key}`,
    '-- 1) Add canonical id columns to target tables.',
    '-- 2) Add indexes for canonical id columns.',
    '-- 3) Add foreign key constraints if schema policy allows.',
    '-- NOTE: statements are generated from registry targets and may need table engine/charset adjustments.',
    '',
  ];
  for (const target of migrationTargets) {
    const idColumn = String(target.idColumn || '').trim();
    if (!idColumn) continue;
    lines.push(
      `ALTER TABLE \`${target.table}\``,
      `  ADD COLUMN \`${idColumn}\` VARCHAR(191) ${
        target.nullable ? 'NULL' : 'NOT NULL'
      },`,
      `  ADD INDEX \`${target.table}_${idColumn}_idx\`(\`${idColumn}\`);`,
      '',
      `ALTER TABLE \`${target.table}\``,
      `  ADD CONSTRAINT \`${target.table}_${idColumn}_fkey\``,
      `  FOREIGN KEY (\`${idColumn}\`) REFERENCES \`${canonicalTable}\`(\`${canonicalIdColumn}\`)`,
      '  ON DELETE SET NULL;',
      '',
    );
  }
  return `${lines.join('\n')}\n`;
}

function renderSeedTemplate(field: MasterDataGovernanceField) {
  const fieldSlug = slugify(field.key);
  const runSeed = field.canonical ? 'true' : 'false';
  return `import { execFileSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

function resolveRepoRoot() {
  const cwd = process.cwd();
  const backendSuffix = \`\${path.sep}apps\${path.sep}backend\`;
  if (cwd.endsWith(backendSuffix)) {
    return path.resolve(cwd, '..', '..');
  }
  return cwd;
}

function run() {
  const reportDirArg = process.argv.find((item) => item.startsWith('--reportDir='));
  const script = path.resolve(
    resolveRepoRoot(),
    'apps',
    'backend',
    'scripts',
    'run-master-data-governance.ts',
  );
  const args = [
    '--import',
    'tsx',
    script,
    '--fields=${field.key}',
    '--seed=${runSeed}',
    '--backfill=false',
    '--audit=false',
    '--failOnAuditError=false',
    '--reportLabel=seed-${fieldSlug}',
  ];
  if (reportDirArg) {
    args.push(reportDirArg);
  }
  execFileSync(process.execPath, args, { stdio: 'inherit' });
}

run();
`;
}

function renderBackfillTemplate(field: MasterDataGovernanceField) {
  const fieldSlug = slugify(field.key);
  const runBackfill =
    field.backfillPolicy === 'canonical-id' ? 'true' : 'false';
  return `import { execFileSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

function resolveRepoRoot() {
  const cwd = process.cwd();
  const backendSuffix = \`\${path.sep}apps\${path.sep}backend\`;
  if (cwd.endsWith(backendSuffix)) {
    return path.resolve(cwd, '..', '..');
  }
  return cwd;
}

function run() {
  const reportDirArg = process.argv.find((item) => item.startsWith('--reportDir='));
  const backfillBatchSizeArg = process.argv.find((item) =>
    item.startsWith('--backfillBatchSize='),
  );
  const backfillMaxRowsPerTableArg = process.argv.find((item) =>
    item.startsWith('--backfillMaxRowsPerTable='),
  );
  const backfillMaxBatchesPerTableArg = process.argv.find((item) =>
    item.startsWith('--backfillMaxBatchesPerTable='),
  );
  const backfillStartAfterIdsByTableArg = process.argv.find((item) =>
    item.startsWith('--backfillStartAfterIdsByTable='),
  );
  const script = path.resolve(
    resolveRepoRoot(),
    'apps',
    'backend',
    'scripts',
    'run-master-data-governance.ts',
  );
  const args = [
    '--import',
    'tsx',
    script,
    '--fields=${field.key}',
    '--seed=false',
    '--backfill=${runBackfill}',
    '--audit=false',
    '--failOnAuditError=false',
    '--reportLabel=backfill-${fieldSlug}',
  ];
  if (reportDirArg) {
    args.push(reportDirArg);
  }
  if (backfillBatchSizeArg) {
    args.push(backfillBatchSizeArg);
  }
  if (backfillMaxRowsPerTableArg) {
    args.push(backfillMaxRowsPerTableArg);
  }
  if (backfillMaxBatchesPerTableArg) {
    args.push(backfillMaxBatchesPerTableArg);
  }
  if (backfillStartAfterIdsByTableArg) {
    args.push(backfillStartAfterIdsByTableArg);
  }
  execFileSync(process.execPath, args, { stdio: 'inherit' });
}

run();
`;
}

function renderAuditTemplate(field: MasterDataGovernanceField) {
  const fieldSlug = slugify(field.key);
  return `import { execFileSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

function resolveRepoRoot() {
  const cwd = process.cwd();
  const backendSuffix = \`\${path.sep}apps\${path.sep}backend\`;
  if (cwd.endsWith(backendSuffix)) {
    return path.resolve(cwd, '..', '..');
  }
  return cwd;
}

function run() {
  const reportDirArg = process.argv.find((item) => item.startsWith('--reportDir='));
  const script = path.resolve(
    resolveRepoRoot(),
    'apps',
    'backend',
    'scripts',
    'run-master-data-governance.ts',
  );
  const args = [
    '--import',
    'tsx',
    script,
    '--fields=${field.key}',
    '--seed=false',
    '--backfill=false',
    '--audit=true',
    '--failOnAuditError=true',
    '--reportLabel=audit-${fieldSlug}',
  ];
  if (reportDirArg) {
    args.push(reportDirArg);
  }
  execFileSync(process.execPath, args, { stdio: 'inherit' });
}

run();
`;
}

function renderExecutionGuide(field: MasterDataGovernanceField) {
  const migrationMode =
    field.targets.some((item) => Boolean(item.idColumn)) && field.canonical
      ? 'canonical-id migration required'
      : 'name-only/no-op migration';
  const canonicalState = field.canonical
    ? `${field.canonical.table}.${field.canonical.idColumn}/${field.canonical.nameColumn}`
    : 'none';
  return `# ${field.key} governance template

- rolloutWave: ${field.rolloutWave}
- writeStrategy: ${field.writeStrategy}
- readStrategy: ${field.readStrategy}
- backfillPolicy: ${field.backfillPolicy}
- auditPolicy: ${field.auditPolicy}
- canonical: ${canonicalState}
- migrationMode: ${migrationMode}

## Generated artifacts

- migration-${slugify(field.key)}.sql
- seed-${slugify(field.key)}.ts
- backfill-${slugify(field.key)}.ts
- audit-${slugify(field.key)}.ts
- governance-${slugify(field.key)}.test.ts

## Execution order

1. Apply migration SQL (if non-noop)
2. Run: \`node --import tsx ./tmp/master-data-governance/${slugify(field.key)}/seed-${slugify(field.key)}.ts\`
3. Run: \`node --import tsx ./tmp/master-data-governance/${slugify(field.key)}/backfill-${slugify(field.key)}.ts --backfillBatchSize=1000 --backfillMaxRowsPerTable=20000\`
4. Run: \`node --import tsx ./tmp/master-data-governance/${slugify(field.key)}/audit-${slugify(field.key)}.ts\`

## Resume example (cursor-based)

- \`node --import tsx ./tmp/master-data-governance/${slugify(field.key)}/backfill-${slugify(field.key)}.ts --backfillStartAfterIdsByTable='{"quality_records":"<lastScannedId>"}'\`
`;
}

function renderTestTemplate(field: MasterDataGovernanceField) {
  return `import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

function resolveRepoRoot() {
  const cwd = process.cwd();
  const backendSuffix = \`\${path.sep}apps\${path.sep}backend\`;
  if (cwd.endsWith(backendSuffix)) {
    return path.resolve(cwd, '..', '..');
  }
  return cwd;
}

async function run() {
  const registryPath = path.resolve(
    resolveRepoRoot(),
    'apps',
    'backend',
    'utils',
    'master-data-governance-registry.ts',
  );
  const mod = await import(pathToFileURL(registryPath).href);
  const getMasterDataGovernanceField = mod.getMasterDataGovernanceField as (
    key: string,
  ) => {
    auditPolicy?: string;
    backfillPolicy?: string;
    key?: string;
    rolloutWave?: number;
  } | null | undefined;
  const field = getMasterDataGovernanceField('${field.key}');
  if (!field) {
    throw new Error('MISSING_FIELD:${field.key}');
  }
  if (field.key !== '${field.key}') {
    throw new Error('FIELD_KEY_MISMATCH:${field.key}');
  }
  if (field.rolloutWave !== ${field.rolloutWave}) {
    throw new Error('ROLLOUT_WAVE_MISMATCH:${field.key}');
  }
  if (field.backfillPolicy !== '${field.backfillPolicy}') {
    throw new Error('BACKFILL_POLICY_MISMATCH:${field.key}');
  }
  if (field.auditPolicy !== '${field.auditPolicy}') {
    throw new Error('AUDIT_POLICY_MISMATCH:${field.key}');
  }
}

run();
`;
}

function resolveFieldKeys(args: Map<string, string>) {
  const fieldArg = String(args.get('field') || '').trim();
  const waveArg = String(args.get('wave') || '').trim();
  const all =
    String(args.get('all') || '')
      .trim()
      .toLowerCase() === 'true';
  if (fieldArg) {
    return fieldArg
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
  if (waveArg) {
    const wave = Number(waveArg);
    if (!listMasterDataGovernanceWaves().includes(wave)) {
      throw new Error(`INVALID_WAVE:${waveArg}`);
    }
    return listMasterDataGovernanceFieldsByWave(wave).map((item) => item.key);
  }
  if (all) {
    return getMasterDataGovernanceFieldKeys();
  }
  throw new Error(
    'USAGE: tsx ./scripts/generate-master-data-governance-template.ts --field=processName[,team] | --wave=1 | --all=true',
  );
}

async function main() {
  const args = normalizeArgs(process.argv.slice(2));
  const fieldKeys = resolveFieldKeys(args);
  const repoRoot = resolveRepoRoot();
  const outputDirArg = String(args.get('outputDir') || '').trim();
  const templateRoot = outputDirArg
    ? path.resolve(outputDirArg)
    : path.resolve(repoRoot, 'tmp', 'master-data-governance');

  for (const fieldKey of fieldKeys) {
    const field = getMasterDataGovernanceField(fieldKey);
    if (!field) {
      throw new Error(`INVALID_FIELD:${fieldKey}`);
    }
    const outDir = path.resolve(templateRoot, slugify(fieldKey));
    await fs.mkdir(outDir, { recursive: true });
    await Promise.all([
      fs.writeFile(
        path.join(outDir, `migration-${slugify(fieldKey)}.sql`),
        renderMigrationTemplate(field),
        'utf8',
      ),
      fs.writeFile(
        path.join(outDir, `seed-${slugify(fieldKey)}.ts`),
        renderSeedTemplate(field),
        'utf8',
      ),
      fs.writeFile(
        path.join(outDir, `backfill-${slugify(fieldKey)}.ts`),
        renderBackfillTemplate(field),
        'utf8',
      ),
      fs.writeFile(
        path.join(outDir, `audit-${slugify(fieldKey)}.ts`),
        renderAuditTemplate(field),
        'utf8',
      ),
      fs.writeFile(
        path.join(outDir, `governance-${slugify(fieldKey)}.test.ts`),
        renderTestTemplate(field),
        'utf8',
      ),
      fs.writeFile(
        path.join(outDir, `README-${slugify(fieldKey)}.md`),
        renderExecutionGuide(field),
        'utf8',
      ),
    ]);
  }

  console.warn('[generate-master-data-governance-template] generated');
  console.warn(
    JSON.stringify(
      {
        fieldKeys,
        templateRoot,
      },
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  console.error('[generate-master-data-governance-template] failed', error);
  process.exitCode = 1;
});
