import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { bootstrapProcessOutsourcingResponsibleDepartment } from './bootstrap-inspection-request-process-outsourcing-responsibility';

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

  it('is a mandatory release-maintenance gate before request responsibility backfill', () => {
    const maintenance = readFileSync(
      resolve(process.cwd(), 'scripts/run-release-maintenance.sh'),
      'utf8',
    );
    const bootstrapIndex = maintenance.indexOf(
      'scripts/bootstrap-inspection-request-process-outsourcing-responsibility.ts',
    );
    const requestBackfillIndex = maintenance.indexOf(
      'scripts/backfill-inspection-request-responsibilities.ts',
    );

    expect(bootstrapIndex).toBeGreaterThanOrEqual(0);
    expect(requestBackfillIndex).toBeGreaterThan(bootstrapIndex);
  });
});
