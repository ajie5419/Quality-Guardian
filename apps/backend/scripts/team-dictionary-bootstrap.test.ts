import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '~/utils/prisma';

import {
  bootstrapTeamDictionaries,
  collectTeamDictionaryCandidates,
} from './team-dictionary-bootstrap';

vi.mock('~/utils/prisma', () => ({
  default: {
    departments: { findMany: vi.fn() },
    dictionaries: { createMany: vi.fn(), findMany: vi.fn() },
    suppliers: { findMany: vi.fn() },
  },
}));

describe('team dictionary bootstrap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('selects department leaves and suppliers governed by TEAM identity', () => {
    const result = collectTeamDictionaryCandidates(
      [
        { id: 'dept-root', name: 'Operations', parentId: '0', sort: 1 },
        { id: 'dept-a', name: 'Assembly', parentId: 'dept-root', sort: 2 },
        { id: 'dept-b', name: 'Welding', parentId: 'dept-root', sort: 3 },
      ],
      [
        {
          category: 'Outsourcing',
          id: 'supplier-team',
          name: 'Resident Service',
          outsourcingMode: 'IN_HOUSE_TEAM',
        },
        {
          category: 'Outsourcing',
          id: 'supplier-processor',
          name: 'External Processor',
          outsourcingMode: 'EXTERNAL_PROCESSOR',
        },
        {
          category: 'Supplier',
          id: 'supplier-incoming',
          name: 'Incoming Supplier',
          outsourcingMode: null,
        },
      ],
    );

    expect(result.map((item) => item.name)).toEqual([
      'Assembly',
      'Welding',
      'Resident Service',
    ]);
  });

  it('merges duplicate names while retaining auditable sources', () => {
    const result = collectTeamDictionaryCandidates(
      [{ id: 'dept-a', name: ' Team A ', parentId: '0', sort: 2 }],
      [
        {
          category: 'Outsourcing',
          id: 'supplier-a',
          name: 'Team   A',
          outsourcingMode: 'EXTERNAL_SERVICE',
        },
      ],
    );

    expect(result).toEqual([
      {
        name: 'Team A',
        sort: 2,
        sources: ['department:dept-a', 'supplier:supplier-a'],
      },
    ]);
  });

  it('creates only missing TEAM entries in apply mode', async () => {
    vi.mocked(prisma.departments.findMany).mockResolvedValue([
      { id: 'dept-a', name: 'Assembly', parentId: '0', sort: 2 },
      { id: 'dept-b', name: 'Welding', parentId: '0', sort: 3 },
    ] as never);
    vi.mocked(prisma.suppliers.findMany).mockResolvedValue([]);
    vi.mocked(prisma.dictionaries.findMany).mockResolvedValue([
      { dictKey: 'Assembly' },
    ] as never);
    vi.mocked(prisma.dictionaries.createMany).mockResolvedValue({ count: 1 });

    await expect(bootstrapTeamDictionaries('apply')).resolves.toEqual({
      candidates: 2,
      created: 1,
      existing: 1,
      mode: 'apply',
    });
    expect(prisma.dictionaries.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          createdBy: 'system:team-dictionary-bootstrap',
          dictKey: 'Welding',
          dictType: 'team',
          dictValue: 'Welding',
          status: 1,
        }),
      ],
      skipDuplicates: true,
    });
  });

  it('does not write in dry-run mode', async () => {
    vi.mocked(prisma.departments.findMany).mockResolvedValue([
      { id: 'dept-a', name: 'Assembly', parentId: '0', sort: 2 },
    ] as never);
    vi.mocked(prisma.suppliers.findMany).mockResolvedValue([]);
    vi.mocked(prisma.dictionaries.findMany).mockResolvedValue([]);

    await expect(bootstrapTeamDictionaries('dry-run')).resolves.toEqual({
      candidates: 1,
      created: 1,
      existing: 0,
      mode: 'dry-run',
    });
    expect(prisma.dictionaries.createMany).not.toHaveBeenCalled();
  });
});
