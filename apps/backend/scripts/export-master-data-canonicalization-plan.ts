import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { listMasterDataGovernanceFields } from '../core/master-data/governance-registry';

function toCamelCase(input: string) {
  return String(input || '')
    .replaceAll(/[_-]+([a-z0-9])/gi, (_, c: string) => c.toUpperCase())
    .replaceAll(/^[A-Z]/g, (s) => s.toLowerCase());
}

function toPascalCase(input: string) {
  const camel = toCamelCase(input);
  return camel ? camel[0].toUpperCase() + camel.slice(1) : camel;
}

function deriveCanonicalIdColumn(nameColumn: string) {
  const base = toCamelCase(nameColumn);
  if (!base) {
    return 'canonicalId';
  }
  if (base.endsWith('Id')) {
    return base;
  }
  return `${base}Id`;
}

function renderAddIdColumnSql(
  table: string,
  idColumn: string,
  nullable: boolean,
) {
  return [
    `ALTER TABLE \`${table}\``,
    `  ADD COLUMN \`${idColumn}\` VARCHAR(191) ${nullable ? 'NULL' : 'NOT NULL'},`,
    `  ADD INDEX \`${table}_${idColumn}_idx\`(\`${idColumn}\`);`,
  ].join('\n');
}

function resolveRepoRoot() {
  const cwd = process.cwd();
  const backendSuffix = `${path.sep}apps${path.sep}backend`;
  if (cwd.endsWith(backendSuffix)) {
    return path.resolve(cwd, '..', '..');
  }
  return cwd;
}

async function main() {
  const fields = listMasterDataGovernanceFields();
  const nameOnlyFields = fields.filter((field) => !field.canonical);

  const plan = nameOnlyFields.map((field) => {
    const canonicalTable = `${toCamelCase(field.key)}_catalog`;
    const canonicalNameColumn = 'name';
    const canonicalIdColumn = 'id';
    const relationName = `${toPascalCase(field.key)}Catalog`;

    const targets = field.targets.map((target) => {
      const idColumn = deriveCanonicalIdColumn(target.nameColumn);
      return {
        table: target.table,
        nameColumn: target.nameColumn,
        proposedIdColumn: idColumn,
        nullable: target.nullable,
        migrationSql: renderAddIdColumnSql(
          target.table,
          idColumn,
          target.nullable,
        ),
      };
    });

    return {
      fieldKey: field.key,
      rolloutWave: field.rolloutWave,
      currentMode: {
        writeStrategy: field.writeStrategy,
        readStrategy: field.readStrategy,
        backfillPolicy: field.backfillPolicy,
        auditPolicy: field.auditPolicy,
      },
      proposedCanonical: {
        relationName,
        table: canonicalTable,
        idColumn: canonicalIdColumn,
        nameColumn: canonicalNameColumn,
        activeWhere: 'isDeleted = 0',
      },
      proposedTargets: targets,
    };
  });

  const result = {
    generatedAt: new Date().toISOString(),
    summary: {
      totalFields: fields.length,
      canonicalFields: fields.filter((field) => Boolean(field.canonical))
        .length,
      nameOnlyFields: nameOnlyFields.length,
    },
    plan,
    notes: [
      'This plan is generated from registry targets and provides a deterministic Phase D canonicalization backlog.',
      'Apply canonical catalog table design review before executing generated SQL in production.',
      'After each field canonicalization: update registry to dual-write/canonical-first/canonical-id/canonical-id-and-orphan and add idColumn targets.',
    ],
  };

  const repoRoot = resolveRepoRoot();
  const outDir = path.resolve(
    repoRoot,
    'tmp',
    'master-data-governance',
    'phase-d',
  );
  await fs.mkdir(outDir, { recursive: true });
  const outFile = path.join(outDir, 'canonicalization-plan.json');
  await fs.writeFile(outFile, `${JSON.stringify(result, null, 2)}\n`, 'utf8');

  console.warn('[export-master-data-canonicalization-plan] generated');
  console.warn(
    JSON.stringify(
      {
        outFile,
        nameOnlyFields: result.summary.nameOnlyFields,
      },
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  console.error('[export-master-data-canonicalization-plan] failed', error);
  process.exitCode = 1;
});
