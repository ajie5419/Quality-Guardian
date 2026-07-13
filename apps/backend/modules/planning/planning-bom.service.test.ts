import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '~/utils/prisma';

import { PlanningBomService } from './planning-bom.service';

vi.mock('~/utils/prisma', () => ({
  default: {
    project_boms: {
      findFirst: vi.fn(),
    },
  },
}));

describe('planning BOM service', () => {
  beforeEach(() => vi.clearAllMocks());

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
