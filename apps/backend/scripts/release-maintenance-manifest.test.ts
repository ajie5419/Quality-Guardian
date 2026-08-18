import type { ReleaseMaintenanceTaskDefinition } from './release-maintenance-manifest';

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

import {
  assertValidReleaseMaintenanceManifest,
  releaseMaintenanceManifest,
  retiredHistoricalReleaseMaintenanceTaskKeys,
} from './release-maintenance-manifest';

const scriptsDirectory = dirname(fileURLToPath(import.meta.url));

function task(taskKey: string): ReleaseMaintenanceTaskDefinition {
  return {
    checksum: 'a'.repeat(64),
    introducedIn: '0.25.0',
    revision: 1,
    run: vi.fn().mockResolvedValue(undefined),
    taskKey,
  };
}

describe('release maintenance manifest', () => {
  it('keeps the ledger runner independent from Redis', () => {
    const entrypoint = readFileSync(
      resolve(scriptsDirectory, 'run-release-maintenance.ts'),
      'utf8',
    );

    expect(entrypoint).not.toContain('~/utils/redis');
    expect(entrypoint).not.toContain('redis.disconnect()');
  });

  it('does not replay retired historical waves and only runs startup prerequisites', () => {
    const keys = releaseMaintenanceManifest.map((task) => task.taskKey);
    expect(keys).toContain('process-responsible-department-backfill');
    for (const retired of retiredHistoricalReleaseMaintenanceTaskKeys) {
      expect(keys).not.toContain(retired);
    }
    expect(retiredHistoricalReleaseMaintenanceTaskKeys).toEqual(
      expect.arrayContaining([
        'rbac-role-page-permissions',
        'identity-relation-backfill',
        'inspection-request-responsibility-backfill',
        'quality-classification-backfill',
      ]),
    );
  });

  it('rejects sidecar, projection, reconciliation, score, merge, remediation, and governance tasks', () => {
    for (const taskKey of [
      'historical-identity-sidecar-bootstrap',
      'pass-rate-projection-refresh',
      'supplier-score-reconcile',
      'team-merge',
      'inspection-remediate',
      'master-data-governance-baseline',
    ]) {
      expect(() =>
        assertValidReleaseMaintenanceManifest([task(taskKey)]),
      ).toThrow('not a startup prerequisite');
    }
  });

  it('requires a unique task revision and a SHA-256 checksum', () => {
    expect(() =>
      assertValidReleaseMaintenanceManifest([
        task('required-backfill'),
        task('required-backfill'),
      ]),
    ).toThrow('Duplicate release maintenance task');
    expect(() =>
      assertValidReleaseMaintenanceManifest([
        { ...task('required-backfill'), checksum: 'not-a-checksum' },
      ]),
    ).toThrow('Invalid release maintenance checksum');
  });
});
