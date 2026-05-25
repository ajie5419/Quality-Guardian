import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const REGISTRY_PATH = path.resolve(
  ROOT,
  'apps',
  'backend',
  'core',
  'master-data',
  'governance-registry.ts',
);

function resolveWavesFromRegistry() {
  const content = fs.readFileSync(REGISTRY_PATH, 'utf8');
  const waves = [...content.matchAll(/\brolloutWave:\s*(\d+)/gu)]
    .map((item) => Number(item[1]))
    .filter((wave) => Number.isFinite(wave));
  return [...new Set(waves)].sort((a, b) => a - b);
}

const registryWaves = resolveWavesFromRegistry();

const steps = [
  {
    name: 'typecheck',
    cmd: 'pnpm run check:type',
  },
  {
    name: 'lint',
    cmd: 'pnpm run lint',
  },
  {
    name: 'qms-arch',
    cmd: 'pnpm run check:qms-arch',
  },
  {
    name: 'master-data-governance-freeze',
    cmd: 'pnpm run check:master-data-governance',
  },
  {
    name: 'master-data-generic-write-entry',
    cmd: 'pnpm run check:master-data-generic-write-entry',
  },
  {
    name: 'master-data-baseline-export',
    cmd: 'pnpm --dir apps/backend run db:export-master-data-baseline',
  },
  {
    name: 'master-data-pending-by-module',
    cmd: 'pnpm --dir apps/backend run db:export-master-data-pending-by-module',
  },
  {
    name: 'master-data-pending-by-module-check',
    cmd: 'pnpm run check:master-data-pending-by-module',
  },
  {
    name: 'master-data-pending-by-module-trend',
    cmd: 'pnpm --dir apps/backend run db:check-master-data-pending-by-module-trend',
  },
  {
    name: 'master-data-excluded-freeze',
    cmd: 'pnpm run check:master-data-excluded-freeze',
  },
  {
    name: 'master-data-registry-policy',
    cmd: 'pnpm run check:master-data-registry-policy',
  },
  {
    name: 'master-data-backlog',
    cmd: 'pnpm run check:master-data-backlog',
  },
  {
    name: 'master-data-helper-alignment',
    cmd: 'pnpm run check:master-data-helper-alignment',
  },
  {
    name: 'master-data-helper-surface',
    cmd: 'pnpm run check:master-data-helper-surface',
  },
  {
    name: 'master-data-generic-write-entry',
    cmd: 'pnpm run check:master-data-generic-write-entry',
  },
  {
    name: 'master-data-deferred-write-paths',
    cmd: 'pnpm run check:master-data-deferred-write-paths',
  },
  {
    name: 'master-data-template',
    cmd: 'pnpm run check:master-data-template',
  },
  {
    name: 'master-data-consistency',
    cmd: 'pnpm --dir apps/backend run db:check-master-data-consistency --reportLabel=release',
  },
  {
    name: 'master-data-metrics-trend',
    cmd: 'pnpm --dir apps/backend run db:check-master-data-metrics-trend',
  },
  {
    name: 'master-data-acceptance',
    cmd: 'pnpm run check:master-data-acceptance',
  },
  ...registryWaves.map((wave) => ({
    name: `master-data-evidence-gate-wave${wave}`,
    cmd: `pnpm --dir apps/backend run db:run-master-data-evidence-gate --wave=${wave} --seed=true --backfill=true --audit=true --failOnAuditError=true --reportLabel=release-wave${wave}`,
  })),
  {
    name: 'master-data-objective-audit',
    cmd: 'pnpm run check:master-data-objective-audit',
  },
  {
    name: 'master-data-quantified-baseline',
    cmd: 'pnpm run check:master-data-quantified-baseline',
  },
  {
    name: 'master-data-write-coverage',
    cmd: 'pnpm --dir apps/backend run db:audit-master-data-write-coverage',
  },
  {
    name: 'master-data-read-coverage',
    cmd: 'pnpm --dir apps/backend run db:audit-master-data-read-coverage',
  },
  {
    name: 'master-data-derived-rules',
    cmd: 'pnpm --dir apps/backend run db:check-master-data-derived-rules',
  },
];

function runStep(step) {
  console.log(`[check-master-data-release-gate] start ${step.name}`);
  execSync(step.cmd, {
    cwd: ROOT,
    stdio: 'inherit',
  });
  console.log(`[check-master-data-release-gate] pass ${step.name}`);
}

try {
  for (const step of steps) {
    runStep(step);
  }
  console.log('[check-master-data-release-gate] PASS');
} catch (error) {
  const message =
    error instanceof Error ? error.message : 'unknown check failure';
  console.error(`[check-master-data-release-gate] FAIL ${message}`);
  process.exitCode = 1;
}
