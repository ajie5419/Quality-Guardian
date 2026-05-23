import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

import {
  getMasterDataGovernanceField,
  getMasterDataGovernanceFieldKeys,
  listMasterDataGovernanceFieldsByWave,
  listMasterDataGovernanceWaves,
} from '../utils/master-data-governance-registry';

function parseArgs(argv: string[]) {
  const args = new Map<string, string>();
  for (const item of argv) {
    if (!item.startsWith('--')) continue;
    const [key, value = ''] = item.slice(2).split('=');
    args.set(key, value);
  }
  return args;
}

function parseBool(value: string | undefined, fallback: boolean) {
  if (value === undefined || value === '') return fallback;
  const normalized = value.toLowerCase().trim();
  if (['1', 'on', 'true', 'y', 'yes'].includes(normalized)) return true;
  if (['0', 'false', 'n', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function resolveFieldKeys(args: Map<string, string>) {
  const fieldsArg = String(args.get('fields') || '').trim();
  if (fieldsArg) {
    return fieldsArg
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  const waveArg = String(args.get('wave') || '').trim();
  if (waveArg) {
    const wave = Number(waveArg);
    if (!listMasterDataGovernanceWaves().includes(wave)) {
      throw new Error(`INVALID_WAVE:${waveArg}`);
    }
    return listMasterDataGovernanceFieldsByWave(wave).map((item) => item.key);
  }

  if (parseBool(args.get('all'), false)) {
    return getMasterDataGovernanceFieldKeys();
  }

  return ['team'];
}

function slugify(input: string) {
  return String(input || '')
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

function runNodeScript(scriptPath: string, args: string[], cwd: string) {
  execFileSync(process.execPath, ['--import', 'tsx', scriptPath, ...args], {
    cwd,
    stdio: 'inherit',
  });
}

type ExecutionStepStatus = 'failed' | 'skipped' | 'success';

type FieldExecutionStatus = {
  audit: ExecutionStepStatus;
  backfill: ExecutionStepStatus;
  seed: ExecutionStepStatus;
  test: ExecutionStepStatus;
};

async function assertArtifacts(outputDir: string, fieldKey: string) {
  const slug = slugify(fieldKey);
  const fieldDir = path.resolve(outputDir, slug);
  const required = [
    `migration-${slug}.sql`,
    `seed-${slug}.ts`,
    `backfill-${slug}.ts`,
    `audit-${slug}.ts`,
    `governance-${slug}.test.ts`,
    `README-${slug}.md`,
  ];
  for (const name of required) {
    await fs.stat(path.join(fieldDir, name));
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = resolveRepoRoot();
  const fieldKeys = resolveFieldKeys(args);
  if (fieldKeys.length === 0) {
    throw new Error('NO_FIELDS_SELECTED');
  }
  const executeCanonical = parseBool(args.get('executeCanonical'), true);
  const executeFieldsArg = String(args.get('executeFields') || '').trim();
  const executeFields = (
    executeFieldsArg
      ? executeFieldsArg
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean)
      : fieldKeys
  ).filter((fieldKey) => {
    if (executeCanonical) return true;
    return !getMasterDataGovernanceField(fieldKey)?.canonical;
  });
  const execute = parseBool(args.get('execute'), true);
  const executeAudit = parseBool(args.get('executeAudit'), true);
  const executeTest = parseBool(args.get('executeTest'), true);
  const cleanup = parseBool(args.get('cleanup'), true);
  const backfillBatchSizeArg = String(
    args.get('backfillBatchSize') || '',
  ).trim();
  const backfillMaxRowsPerTableArg = String(
    args.get('backfillMaxRowsPerTable') || '',
  ).trim();
  const backfillMaxBatchesPerTableArg = String(
    args.get('backfillMaxBatchesPerTable') || '',
  ).trim();
  const backfillStartAfterIdsByTableArg = String(
    args.get('backfillStartAfterIdsByTable') || '',
  ).trim();
  const outputDir =
    String(args.get('outputDir') || '').trim() ||
    path.resolve(
      os.tmpdir(),
      'master-data-governance',
      `template-verify-${Date.now()}`,
    );
  const reportDir = path.resolve(outputDir, 'reports');
  const executionStatus: Record<string, FieldExecutionStatus> = {};
  for (const fieldKey of fieldKeys) {
    executionStatus[fieldKey] = {
      seed: 'skipped',
      backfill: 'skipped',
      audit: 'skipped',
      test: 'skipped',
    };
  }

  const generatorPath = path.resolve(
    repoRoot,
    'apps',
    'backend',
    'scripts',
    'generate-master-data-governance-template.ts',
  );

  runNodeScript(
    generatorPath,
    [`--field=${fieldKeys.join(',')}`, `--outputDir=${outputDir}`],
    repoRoot,
  );

  for (const fieldKey of fieldKeys) {
    await assertArtifacts(outputDir, fieldKey);
  }

  if (execute) {
    for (const fieldKey of executeFields) {
      const slug = slugify(fieldKey);
      const seedPath = path.resolve(outputDir, slug, `seed-${slug}.ts`);
      const backfillPath = path.resolve(outputDir, slug, `backfill-${slug}.ts`);
      const auditPath = path.resolve(outputDir, slug, `audit-${slug}.ts`);
      const testPath = path.resolve(
        outputDir,
        slug,
        `governance-${slug}.test.ts`,
      );
      try {
        runNodeScript(seedPath, [`--reportDir=${reportDir}`], repoRoot);
        executionStatus[fieldKey].seed = 'success';
      } catch (_error) {
        executionStatus[fieldKey].seed = 'failed';
        throw _error;
      }
      const backfillArgs = [`--reportDir=${reportDir}`];
      if (backfillBatchSizeArg) {
        backfillArgs.push(`--backfillBatchSize=${backfillBatchSizeArg}`);
      }
      if (backfillMaxRowsPerTableArg) {
        backfillArgs.push(
          `--backfillMaxRowsPerTable=${backfillMaxRowsPerTableArg}`,
        );
      }
      if (backfillMaxBatchesPerTableArg) {
        backfillArgs.push(
          `--backfillMaxBatchesPerTable=${backfillMaxBatchesPerTableArg}`,
        );
      }
      if (backfillStartAfterIdsByTableArg) {
        backfillArgs.push(
          `--backfillStartAfterIdsByTable=${backfillStartAfterIdsByTableArg}`,
        );
      }
      try {
        runNodeScript(backfillPath, backfillArgs, repoRoot);
        executionStatus[fieldKey].backfill = 'success';
      } catch (_error) {
        executionStatus[fieldKey].backfill = 'failed';
        throw _error;
      }
      if (executeAudit) {
        try {
          runNodeScript(auditPath, [`--reportDir=${reportDir}`], repoRoot);
          executionStatus[fieldKey].audit = 'success';
        } catch (_error) {
          executionStatus[fieldKey].audit = 'failed';
          throw _error;
        }
      }
      if (executeTest) {
        try {
          runNodeScript(testPath, [], repoRoot);
          executionStatus[fieldKey].test = 'success';
        } catch (_error) {
          executionStatus[fieldKey].test = 'failed';
          throw _error;
        }
      }
    }
  }

  if (cleanup) {
    await fs.rm(outputDir, { recursive: true, force: true });
  }

  console.warn('[verify-master-data-governance-template] result');
  console.warn(
    JSON.stringify(
      {
        outputDir,
        cleanedUp: cleanup,
        execute,
        executeAudit,
        executeCanonical,
        executeFields,
        executeTest,
        executionStatus,
        fieldKeys,
      },
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  console.error('[verify-master-data-governance-template] failed', error);
  process.exitCode = 1;
});
