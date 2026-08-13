import { OUTSOURCING_INSPECTION_RESPONSIBLE_DEPARTMENT } from '@qgs/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DeptService } from '~/modules/dept';

import { resolveProcessOutsourcingResponsibleDepartmentId } from './inspection-request-responsibility-default.service';

vi.mock('~/modules/dept', () => ({
  DeptService: { findActiveByIdsOrNames: vi.fn() },
}));

describe('process outsourcing responsibility department default', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uses the one active canonical policy department', async () => {
    vi.mocked(DeptService.findActiveByIdsOrNames).mockResolvedValue([
      {
        businessUnit: '',
        id: 'dept-production',
        name: OUTSOURCING_INSPECTION_RESPONSIBLE_DEPARTMENT,
      },
    ]);

    await expect(
      resolveProcessOutsourcingResponsibleDepartmentId({} as any),
    ).resolves.toBe('dept-production');
  });

  it.each([
    { departments: [] },
    {
      departments: [
        {
          businessUnit: '',
          id: 'a',
          name: OUTSOURCING_INSPECTION_RESPONSIBLE_DEPARTMENT,
        },
        {
          businessUnit: '',
          id: 'b',
          name: OUTSOURCING_INSPECTION_RESPONSIBLE_DEPARTMENT,
        },
      ],
    },
  ])(
    'fails closed when the canonical policy department is unavailable or ambiguous',
    async ({ departments }) => {
      vi.mocked(DeptService.findActiveByIdsOrNames).mockResolvedValue(
        departments,
      );

      await expect(
        resolveProcessOutsourcingResponsibleDepartmentId({} as any),
      ).rejects.toMatchObject({
        code: 'INSPECTION_REQUEST_OUTSOURCING_DEPARTMENT_UNRESOLVED',
      });
    },
  );
});
