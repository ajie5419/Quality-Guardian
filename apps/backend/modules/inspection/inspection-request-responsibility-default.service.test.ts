import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProcessOutsourcingResponsibleDepartmentSettingService } from '~/modules/system';

import { resolveProcessOutsourcingResponsibleDepartmentId } from './inspection-request-responsibility-default.service';

vi.mock('~/modules/system', () => ({
  ProcessOutsourcingResponsibleDepartmentSettingService: {
    resolveConfiguredDepartment: vi.fn(),
  },
}));

describe('process outsourcing responsibility department default', () => {
  beforeEach(() => vi.clearAllMocks());

  it('delegates canonical ID resolution to the system setting boundary', async () => {
    vi.mocked(
      ProcessOutsourcingResponsibleDepartmentSettingService.resolveConfiguredDepartment,
    ).mockResolvedValue({
      businessUnit: '',
      id: 'dept-production',
      name: 'Renamed production department',
    });

    await expect(
      resolveProcessOutsourcingResponsibleDepartmentId({} as any),
    ).resolves.toBe('dept-production');
  });

  it('preserves the transaction boundary for bootstrap and configuration reads', async () => {
    const tx = {} as any;
    vi.mocked(
      ProcessOutsourcingResponsibleDepartmentSettingService.resolveConfiguredDepartment,
    ).mockResolvedValue({ id: 'dept-production', name: 'Production' });

    await resolveProcessOutsourcingResponsibleDepartmentId(tx);

    expect(
      ProcessOutsourcingResponsibleDepartmentSettingService.resolveConfiguredDepartment,
    ).toHaveBeenCalledWith(tx);
  });
});
