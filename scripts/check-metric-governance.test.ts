import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT_DIR = process.cwd();
const CHECK_SCRIPT = path.join(ROOT_DIR, 'scripts/check-metric-governance.mjs');

const schema = `
model metric_definitions {
  id String @id
  metricCode String @unique
  metricName String
  domain String
  category String
  ownerDeptId String?
  ownerStatus String
  status String
  currentVersion Int
  revision Int
  ownerAssignments metric_owner_assignments[]
}

model metric_definition_versions {
  id String @id
  metricDefinitionId String
  version Int
  businessDefinition String
  formulaType String
  sourceModel Json
  sourceFields Json
  dimensions Json
  exclusions Json
  scopePolicy String
  refreshPolicy String
  unit String
  precision Int
  effectiveFromAt DateTime
  conflictStatus String
  approvalEvidence String?
  decisionHistoryId String?
  sourceDocument String?
  approvalEvidences metric_approval_evidences[]

  @@unique([metricDefinitionId, version])
}

model metric_approval_evidences {
  id String @id
  metricDefinitionVersionId String
  decisionHistoryId String
  decisionStatus String
  approvedOption String
  approvedDefinition String
  decisionSource String
  decisionBy String
  sourceDocument String

  @@unique([metricDefinitionVersionId, decisionHistoryId])
}

model metric_canonical_mappings {
  id String @id
  legacyMetricDefinitionId String
  canonicalMetricDefinitionVersionId String
  decisionHistoryId String
  mappingType String
  sourceDocument String
}

model metric_owner_assignments {
  id String @id
  metricDefinitionId String
  ownerRole String
  ownerLabel String
  ownerStatus String
}
`;

function createFixture(source: string) {
  const rootDir = mkdtempSync(path.join(tmpdir(), 'metric-governance-'));
  const schemaFile = path.join(rootDir, 'apps/backend/prisma/schema.prisma');
  const moduleFile = path.join(
    rootDir,
    'apps/backend/modules/metric-governance/metric-governance.service.ts',
  );
  mkdirSync(path.dirname(schemaFile), { recursive: true });
  mkdirSync(path.dirname(moduleFile), { recursive: true });
  writeFileSync(schemaFile, schema, 'utf8');
  writeFileSync(moduleFile, source, 'utf8');
  return rootDir;
}

function runGuard(rootDir: string) {
  const result = spawnSync('node', [CHECK_SCRIPT, '--root', rootDir], {
    cwd: ROOT_DIR,
    encoding: 'utf8',
  });
  return `${result.stdout}${result.stderr}`;
}

describe('metric governance invariant check', () => {
  it('allows append-only versions and lifecycle revision CAS', () => {
    const rootDir = createFixture(`
async function update() {
  return prisma.metric_definitions.updateMany({
    where: { id: 'metric-1', status: 'DRAFT', revision: 1 },
    data: { revision: { increment: 1 } },
  });
}

async function appendVersion() {
  return prisma.metric_definition_versions.create({ data: {} });
}
`);
    try {
      expect(runGuard(rootDir)).toContain(
        'Metric governance invariant check passed.',
      );
    } finally {
      rmSync(rootDir, { force: true, recursive: true });
    }
  });

  it('rejects version overwrite, physical delete, and direct active overwrite paths', () => {
    const rootDir = createFixture(`
async function violate() {
  await prisma.metric_definition_versions.update({ data: {} });
  await prisma.metric_definitions.delete({ where: { id: 'metric-1' } });
  await prisma.metric_definitions.update({ data: {} });
  await prisma.metric_definitions.updateMany({
    where: { id: 'metric-1' },
    data: { metricName: 'overwritten' },
  });
}
`);
    try {
      const output = runGuard(rootDir);
      expect(output).toContain('[MG-APPEND-ONLY-VERSION]');
      expect(output).toContain('[MG-NO-PHYSICAL-DELETE]');
      expect(output).toContain('[MG-NO-DIRECT-UPDATE]');
      expect(output).toContain('[MG-LIFECYCLE-CAS]');
    } finally {
      rmSync(rootDir, { force: true, recursive: true });
    }
  });

  it('rejects an activation path that bypasses readiness validation', () => {
    const rootDir = createFixture(`
async function activate() {
  return prisma.metric_definitions.updateMany({
    where: { id: 'metric-1', status: 'DRAFT', revision: 1 },
    data: { status: 'ACTIVE', revision: { increment: 1 } },
  });
}
`);
    try {
      expect(runGuard(rootDir)).toContain('[MG-ACTIVATION-READINESS]');
    } finally {
      rmSync(rootDir, { force: true, recursive: true });
    }
  });
});
