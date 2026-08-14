import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

import { bootstrapProcessOutsourcingResponsibleDepartment } from './bootstrap-inspection-request-process-outsourcing-responsibility';
import { retiredHistoricalReleaseMaintenanceTaskKeys } from './release-maintenance-manifest';

const scriptsDirectory = dirname(fileURLToPath(import.meta.url));

const { resolveConfiguredDepartment } = vi.hoisted(() => ({
  resolveConfiguredDepartment: vi.fn(),
}));

vi.mock('~/modules/system', () => ({
  ProcessOutsourcingResponsibleDepartmentSettingService: {
    resolveConfiguredDepartment,
  },
}));

vi.mock('~/utils/logger', () => ({
  createModuleLogger: vi.fn(() => ({ fatal: vi.fn(), info: vi.fn() })),
}));

describe('process outsourcing responsibility bootstrap', () => {
  it('uses the same canonical resolver as runtime', async () => {
    resolveConfiguredDepartment.mockResolvedValue({
      id: 'dept-canonical',
      name: 'Current department name',
    });

    await expect(
      bootstrapProcessOutsourcingResponsibleDepartment(),
    ).resolves.toEqual({
      id: 'dept-canonical',
      name: 'Current department name',
    });
  });

  it('preserves bootstrap ordering in versioned release maintenance', () => {
    const entrypoint = readFileSync(
      resolve(scriptsDirectory, 'run-release-maintenance.ts'),
      'utf8',
    );
    const bootstrapIndex = retiredHistoricalReleaseMaintenanceTaskKeys.indexOf(
      'inspection-request-process-outsourcing-responsibility-bootstrap',
    );
    const requestBackfillIndex =
      retiredHistoricalReleaseMaintenanceTaskKeys.indexOf(
        'inspection-request-responsibility-backfill',
      );

    expect(entrypoint).toContain('releaseMaintenanceManifest');
    expect(entrypoint).toContain('runReleaseMaintenance');
    expect(bootstrapIndex).toBeGreaterThanOrEqual(0);
    expect(requestBackfillIndex).toBeGreaterThan(bootstrapIndex);
  });
});
