import { OUTSOURCING_INSPECTION_RESPONSIBLE_DEPARTMENT } from '@qgs/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DeptService } from '~/modules/dept';
import prisma from '~/utils/prisma';

import {
  PROCESS_OUTSOURCING_RESPONSIBLE_DEPARTMENT_ID_SETTING_KEY,
  ProcessOutsourcingResponsibleDepartmentSettingService,
} from './inspection-request-outsourcing-responsibility-setting.service';

vi.mock('~/modules/dept', () => ({
  DeptService: {
    findActiveById: vi.fn(),
    findActiveByIdsOrNames: vi.fn(),
  },
}));

vi.mock('~/utils/prisma', () => ({
  default: {
    system_settings: {
      create: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

describe('process outsourcing responsibility department setting', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uses configured canonical ID after the department is renamed', async () => {
    vi.mocked(prisma.system_settings.findUnique).mockResolvedValue({
      value: 'dept-canonical',
    } as never);
    vi.mocked(DeptService.findActiveById).mockResolvedValue({
      businessUnit: null,
      id: 'dept-canonical',
      name: 'Renamed production unit',
    });

    await expect(
      ProcessOutsourcingResponsibleDepartmentSettingService.resolveConfiguredDepartment(),
    ).resolves.toMatchObject({
      id: 'dept-canonical',
      name: 'Renamed production unit',
    });
    expect(DeptService.findActiveByIdsOrNames).not.toHaveBeenCalled();
  });

  it('bootstraps an absent setting from one active legacy candidate', async () => {
    vi.mocked(prisma.system_settings.findUnique).mockResolvedValue(null);
    vi.mocked(DeptService.findActiveByIdsOrNames).mockResolvedValue([
      {
        businessUnit: null,
        id: 'dept-canonical',
        name: OUTSOURCING_INSPECTION_RESPONSIBLE_DEPARTMENT,
      },
    ]);
    vi.mocked(DeptService.findActiveById).mockResolvedValue({
      businessUnit: null,
      id: 'dept-canonical',
      name: OUTSOURCING_INSPECTION_RESPONSIBLE_DEPARTMENT,
    });

    await expect(
      ProcessOutsourcingResponsibleDepartmentSettingService.resolveConfiguredDepartment(),
    ).resolves.toMatchObject({ id: 'dept-canonical' });
    expect(prisma.system_settings.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        key: PROCESS_OUTSOURCING_RESPONSIBLE_DEPARTMENT_ID_SETTING_KEY,
        value: 'dept-canonical',
      }),
    });
  });

  it.each([
    { candidates: [] },
    { candidates: [{ id: 'dept-a' }, { id: 'dept-b' }] },
  ])(
    'fails closed when the absent setting has $candidates legacy candidates',
    async ({ candidates }) => {
      vi.mocked(prisma.system_settings.findUnique).mockResolvedValue(null);
      vi.mocked(DeptService.findActiveByIdsOrNames).mockResolvedValue(
        candidates.map((candidate) => ({
          businessUnit: null,
          name: OUTSOURCING_INSPECTION_RESPONSIBLE_DEPARTMENT,
          ...candidate,
        })),
      );

      await expect(
        ProcessOutsourcingResponsibleDepartmentSettingService.resolveConfiguredDepartment(),
      ).rejects.toMatchObject({
        code: 'PROCESS_OUTSOURCING_RESPONSIBLE_DEPARTMENT_BOOTSTRAP_UNRESOLVED',
      });
      expect(prisma.system_settings.create).not.toHaveBeenCalled();
    },
  );

  it('fails closed when the configured department is no longer active', async () => {
    vi.mocked(prisma.system_settings.findUnique).mockResolvedValue({
      value: 'dept-retired',
    } as never);
    vi.mocked(DeptService.findActiveById).mockResolvedValue(null);

    await expect(
      ProcessOutsourcingResponsibleDepartmentSettingService.resolveConfiguredDepartment(),
    ).rejects.toMatchObject({
      code: 'PROCESS_OUTSOURCING_RESPONSIBLE_DEPARTMENT_CONFIGURATION_INVALID',
    });
  });

  it('re-reads the winning configuration when concurrent bootstrap creates it', async () => {
    vi.mocked(prisma.system_settings.findUnique)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ value: 'dept-winner' } as never);
    vi.mocked(DeptService.findActiveByIdsOrNames).mockResolvedValue([
      {
        businessUnit: null,
        id: 'dept-legacy-candidate',
        name: OUTSOURCING_INSPECTION_RESPONSIBLE_DEPARTMENT,
      },
    ]);
    vi.mocked(prisma.system_settings.create).mockRejectedValue({
      code: 'P2002',
    });
    vi.mocked(DeptService.findActiveById).mockResolvedValue({
      businessUnit: null,
      id: 'dept-winner',
      name: 'Renamed after competing bootstrap',
    });

    await expect(
      ProcessOutsourcingResponsibleDepartmentSettingService.resolveConfiguredDepartment(),
    ).resolves.toMatchObject({ id: 'dept-winner' });
    expect(DeptService.findActiveById).toHaveBeenCalledWith(
      'dept-winner',
      prisma,
    );
  });
});
