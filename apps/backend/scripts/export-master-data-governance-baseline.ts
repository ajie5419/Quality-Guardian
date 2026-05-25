import type { MasterDataGovernanceField } from '../core/master-data/governance-registry';

import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import {
  listMasterDataGovernanceFields,
  listMasterDataGovernanceWaves,
} from '../core/master-data/governance-registry';

type RiskLevel = 'high' | 'low' | 'medium';
type PathUsageKind = 'read' | 'unknown' | 'write';

interface PathUsageEvidence {
  file: string;
  kind: PathUsageKind;
  line: number;
  snippet: string;
  token: string;
}

function computeFieldRisks(field: MasterDataGovernanceField) {
  const risks: Array<{ detail: string; level: RiskLevel }> = [];
  if (!field.canonical && field.readStrategy === 'name-only') {
    risks.push({
      level: 'medium',
      detail:
        'No canonical id relation yet; name normalization quality is critical.',
    });
  }
  if (field.source.type === 'derived') {
    risks.push({
      level: 'high',
      detail: 'Derived source requires frozen mapping rules before rollout.',
    });
  }
  if (field.targets.some((item) => item.nullable === false)) {
    risks.push({
      level: 'medium',
      detail:
        'Contains non-null target columns; migration must preserve write compatibility.',
    });
  }
  if (field.backfillPolicy === 'canonical-id') {
    risks.push({
      level: 'low',
      detail:
        'Backfill progress and id validity should be monitored continuously.',
    });
  }
  return risks;
}

function escapeRegex(input: string) {
  return input.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

function classifyPathUsage(snippet: string): PathUsageKind {
  const content = snippet.toLowerCase();
  if (
    /\b(?:create|update|upsert)\b/.test(content) ||
    content.includes('data:') ||
    content.includes('set:')
  ) {
    return 'write';
  }
  if (
    content.includes('select:') ||
    content.includes('where:') ||
    content.includes('contains:') ||
    content.includes('groupby') ||
    content.includes('orderby')
  ) {
    return 'read';
  }
  return 'unknown';
}

function collectFieldPathInventory(
  backendDir: string,
  field: MasterDataGovernanceField,
) {
  const tokens = [...new Set(field.targets.map((target) => target.nameColumn))]
    .map((item) => String(item || '').trim())
    .filter(Boolean);
  if (tokens.length === 0) {
    return {
      evidence: [] as PathUsageEvidence[],
      summary: {
        read: 0,
        unknown: 0,
        write: 0,
      },
    };
  }

  const pattern = `(${tokens.map((item) => escapeRegex(item)).join('|')})`;
  const scanPaths = ['api', 'services', 'utils']
    .map((dir) => path.join(backendDir, dir))
    .filter((dir) => dir.startsWith(backendDir));
  const result = spawnSync(
    'rg',
    [
      '-n',
      '--no-heading',
      '--color',
      'never',
      '-g',
      '*.ts',
      '-g',
      '!**/*.test.ts',
      pattern,
      ...scanPaths,
    ],
    {
      cwd: backendDir,
      encoding: 'utf8',
    },
  );

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0 && result.status !== 1) {
    throw new Error(
      `[export-master-data-governance-baseline] rg failed: ${String(
        result.stderr || result.stdout || '',
      )}`,
    );
  }

  const evidence: PathUsageEvidence[] = [];
  const lines = String(result.stdout || '')
    .split('\n')
    .map((line) => line.trimEnd())
    .filter(Boolean);

  for (const line of lines) {
    const firstColon = line.indexOf(':');
    const secondColon = line.indexOf(':', firstColon + 1);
    if (firstColon <= 0 || secondColon <= firstColon) continue;

    const filePath = line.slice(0, firstColon);
    const lineText = line.slice(secondColon + 1);
    const normalizedPath = filePath.replaceAll('\\', '/');
    if (
      /(?:^|\/)(?:master-data-governance-(?:registry|write|kernel)|governance-(?:registry|write|kernel))\.ts$/.test(
        normalizedPath,
      )
    ) {
      continue;
    }

    const token = tokens.find((item) => lineText.includes(item));
    if (!token) continue;

    evidence.push({
      file: path.relative(backendDir, filePath),
      line: Number(line.slice(firstColon + 1, secondColon)),
      snippet: lineText.trim(),
      token,
      kind: classifyPathUsage(lineText),
    });
  }

  const summary = {
    read: 0,
    unknown: 0,
    write: 0,
  };
  for (const item of evidence) {
    summary[item.kind] += 1;
  }

  return {
    summary,
    evidence,
  };
}

function computeSourceCatalog(fields: MasterDataGovernanceField[]) {
  return fields.map((field) => ({
    fieldKey: field.key,
    sourceType: field.source.type,
    source: field.source,
  }));
}

async function resolveBackendDir() {
  const cwd = process.cwd();
  const backendFromRoot = path.resolve(cwd, 'apps', 'backend');
  const backendFromCwd = cwd;

  const hasBackendLayout = async (dir: string) => {
    const required = ['api', 'services', 'utils'].map((item) =>
      path.join(dir, item),
    );
    try {
      await Promise.all(required.map((item) => fs.stat(item)));
      return true;
    } catch {
      return false;
    }
  };

  if (await hasBackendLayout(backendFromRoot)) {
    return backendFromRoot;
  }
  if (await hasBackendLayout(backendFromCwd)) {
    return backendFromCwd;
  }

  throw new Error(
    'BACKEND_DIR_NOT_FOUND: expected apps/backend or current dir containing api/services/utils',
  );
}

async function main() {
  const backendDir = await resolveBackendDir();
  const repoRoot = backendDir.endsWith(path.join('apps', 'backend'))
    ? path.resolve(backendDir, '..', '..')
    : path.resolve(backendDir, '..');
  const fields = listMasterDataGovernanceFields();
  const pathInventory = fields.map((field) => {
    const inventory = collectFieldPathInventory(backendDir, field);
    return {
      fieldKey: field.key,
      tokens: [...new Set(field.targets.map((target) => target.nameColumn))],
      ...inventory,
    };
  });
  let totalPathEvidence = 0;
  for (const item of pathInventory) {
    totalPathEvidence += item.evidence.length;
  }
  const baseline = {
    generatedAt: new Date().toISOString(),
    summary: {
      totalFields: fields.length,
      totalPathEvidence,
      waves: listMasterDataGovernanceWaves().map((wave) => ({
        fieldKeys: fields
          .filter((field) => field.rolloutWave === wave)
          .map((field) => field.key),
        wave,
      })),
    },
    phase0: {
      fieldCatalog: fields.map((field) => ({
        fieldKey: field.key,
        rolloutWave: field.rolloutWave,
        targetCount: field.targets.length,
        sourceType: field.source.type,
      })),
      sourceCatalog: computeSourceCatalog(fields),
      pathInventory,
      frozenGuardrails: {
        enabled: true,
        gate: 'scripts/check-master-data-governance.mjs',
        rule: 'forbid-new-direct-name-id-mapping',
      },
    },
    fields: fields.map((field) => ({
      key: field.key,
      rolloutWave: field.rolloutWave,
      source: field.source,
      writeStrategy: field.writeStrategy,
      readStrategy: field.readStrategy,
      backfillPolicy: field.backfillPolicy,
      auditPolicy: field.auditPolicy,
      canonical: field.canonical || null,
      targets: field.targets,
      risks: computeFieldRisks(field),
    })),
  };

  const outDir = path.resolve(repoRoot, 'tmp', 'master-data-governance');
  await fs.mkdir(outDir, { recursive: true });
  const outFile = path.join(outDir, 'baseline.json');
  await fs.writeFile(outFile, `${JSON.stringify(baseline, null, 2)}\n`, 'utf8');

  console.warn('[export-master-data-governance-baseline] generated');
  console.warn(
    JSON.stringify(
      {
        outFile,
        totalFields: baseline.summary.totalFields,
      },
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  console.error('[export-master-data-governance-baseline] failed', error);
  process.exitCode = 1;
});
