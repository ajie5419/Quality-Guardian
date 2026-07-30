import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PartMasterService } from '~/modules/part-master';
import prisma from '~/utils/prisma';

import { PlanningBomService } from './planning-bom.service';

vi.mock('~/utils/prisma', () => ({
  default: {
    project_boms: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock('~/modules/part-master', () => ({
  PartMasterService: {
    resolveOrCreateActive: vi.fn(),
  },
}));

describe('planning BOM service', () => {
  beforeEach(() => vi.clearAllMocks());

  it('resolves a stable canonical identity for BOM writes', async () => {
    vi.mocked(PartMasterService.resolveOrCreateActive).mockResolvedValue({
      id: 'part-1',
      name: '减速机',
    });

    await expect(
      PlanningBomService.resolvePartIdentityForWrite({
        partName: ' 减速机 ',
      }),
    ).resolves.toEqual({ id: 'part-1', name: '减速机' });
    expect(PartMasterService.resolveOrCreateActive).toHaveBeenCalledWith(
      { name: '减速机', partId: undefined },
      prisma,
    );
  });

  it('scopes a canonical part lookup to the selected work order', async () => {
    await PlanningBomService.findPartReference({
      partId: 'part-1',
      partName: '主梁',
      workOrderNumber: 'WO-1',
    });

    expect(prisma.project_boms.findFirst).toHaveBeenCalledWith({
      where: { partId: 'part-1', work_order_number: 'WO-1' },
      select: { partId: true, part_name: true },
    });
  });

  it('falls back to the BOM part name when canonical id is absent', async () => {
    await PlanningBomService.findPartReference({
      partName: '主梁',
      workOrderNumber: 'WO-1',
    });

    expect(prisma.project_boms.findFirst).toHaveBeenCalledWith({
      where: { part_name: '主梁', work_order_number: 'WO-1' },
      select: { partId: true, part_name: true },
    });
  });
});
