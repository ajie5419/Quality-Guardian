import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  resolveLinkedInternalResponsibilities,
  resolveUniqueLinkedInternalInspectionIdsForTeam,
} from './inspection-record-linked-responsibility.service';

const { findMany } = vi.hoisted(() => ({ findMany: vi.fn() }));

vi.mock('~/utils/prisma', () => ({
  default: { qms_inspection_requests: { findMany } },
}));

vi.mock('~/modules/dept', () => ({
  DeptService: {
    findActiveByNameContains: vi.fn().mockResolvedValue([]),
    resolveActiveNamesByIds: vi.fn().mockResolvedValue(new Map()),
  },
}));

describe('inspection record linked responsibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves one direct or join-table internal request department in bulk', async () => {
    findMany.mockResolvedValueOnce([
      {
        inspectionId: 'inspection-1',
        inspectionLinks: [],
        responsibleDepartment: 'Machining BU',
      },
      {
        inspectionId: null,
        inspectionLinks: [{ inspectionId: 'inspection-2' }],
        responsibleDepartment: 'Structure BU',
      },
    ]);

    const result = await resolveLinkedInternalResponsibilities([
      {
        category: 'PROCESS',
        id: 'inspection-1',
        responsibilityType: null,
        responsibleDepartment: null,
      },
      {
        category: 'PROCESS',
        id: 'inspection-2',
        responsibilityType: null,
        responsibleDepartment: null,
      },
    ]);

    expect(result).toEqual(
      new Map([
        [
          'inspection-1',
          { linkedInternalResponsibleDepartment: 'Machining BU' },
        ],
        [
          'inspection-2',
          { linkedInternalResponsibleDepartment: 'Structure BU' },
        ],
      ]),
    );
    expect(findMany).toHaveBeenCalledTimes(1);
  });

  it('excludes conflicted historical links from the database team filter set', async () => {
    findMany
      .mockResolvedValueOnce([
        {
          inspectionId: 'inspection-1',
          inspectionLinks: [],
        },
      ])
      .mockResolvedValueOnce([
        {
          inspectionId: 'inspection-1',
          inspectionLinks: [],
          responsibleDepartment: 'Machining BU',
        },
        {
          inspectionId: null,
          inspectionLinks: [{ inspectionId: 'inspection-1' }],
          responsibleDepartment: 'Structure BU',
        },
      ]);

    await expect(
      resolveUniqueLinkedInternalInspectionIdsForTeam('machining'),
    ).resolves.toEqual([]);
  });

  it('keeps a unique partial department match for database pagination', async () => {
    findMany
      .mockResolvedValueOnce([
        {
          inspectionId: 'inspection-1',
          inspectionLinks: [],
        },
      ])
      .mockResolvedValueOnce([
        {
          inspectionId: 'inspection-1',
          inspectionLinks: [],
          responsibleDepartment: 'Machining BU',
        },
      ]);

    await expect(
      resolveUniqueLinkedInternalInspectionIdsForTeam('machining'),
    ).resolves.toEqual(['inspection-1']);
  });
});
