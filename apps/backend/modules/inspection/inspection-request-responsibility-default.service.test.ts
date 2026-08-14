import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InspectionRequestResponsibilityDepartmentSettingService } from '~/modules/system';

import {
  resolveInspectionRequestResponsibilityDepartmentId,
  resolveProcessOutsourcingResponsibleDepartmentId,
} from './inspection-request-responsibility-default.service';

vi.mock('~/modules/system', () => ({
  InspectionRequestResponsibilityDepartmentSettingService: {
    resolveConfiguredDepartment: vi.fn(),
  },
}));

describe('process outsourcing responsibility department default', () => {
  beforeEach(() => vi.clearAllMocks());

  it('delegates canonical ID resolution to the system setting boundary', async () => {
    vi.mocked(
      InspectionRequestResponsibilityDepartmentSettingService.resolveConfiguredDepartment,
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
      InspectionRequestResponsibilityDepartmentSettingService.resolveConfiguredDepartment,
    ).mockResolvedValue({ id: 'dept-production', name: 'Production' });

    await resolveProcessOutsourcingResponsibleDepartmentId(tx);

    expect(
      InspectionRequestResponsibilityDepartmentSettingService.resolveConfiguredDepartment,
    ).toHaveBeenCalledWith('OUTSOURCING_UNIT', tx);
  });

  it('resolves the incoming supplier department through the same setting boundary', async () => {
    vi.mocked(
      InspectionRequestResponsibilityDepartmentSettingService.resolveConfiguredDepartment,
    ).mockResolvedValue({ id: 'dept-purchasing', name: 'Purchasing' });

    await expect(
      resolveInspectionRequestResponsibilityDepartmentId('SUPPLIER', {} as any),
    ).resolves.toBe('dept-purchasing');
    expect(
      InspectionRequestResponsibilityDepartmentSettingService.resolveConfiguredDepartment,
    ).toHaveBeenCalledWith('SUPPLIER', expect.any(Object));
  });
});
