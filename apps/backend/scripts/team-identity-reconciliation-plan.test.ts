import { describe, expect, it } from 'vitest';

import {
  chooseTeamForSource,
  findAmbiguousTeamGroups,
} from './team-identity-reconciliation-plan';

const source = {
  name: 'StructureBU2',
  sort: 1,
  sourceId: 'department-1',
  sourceType: 'DEPARTMENT' as const,
};

describe('team identity reconciliation planning', () => {
  it('uses a stable source link before considering names', () => {
    expect(
      chooseTeamForSource(
        source,
        [
          { id: 'team-linked', name: 'Old Name', status: 1 },
          { id: 'team-exact', name: 'StructureBU2', status: 1 },
        ],
        [
          {
            isDeleted: false,
            sourceId: source.sourceId,
            sourceType: source.sourceType,
            teamId: 'team-linked',
          },
        ],
        new Map(),
      ),
    ).toEqual({ action: 'link', teamId: 'team-linked' });
  });

  it('preserves a stable source that was explicitly retired', () => {
    expect(
      chooseTeamForSource(
        source,
        [{ id: 'team-retired', name: 'StructureBU2', status: 0 }],
        [
          {
            isDeleted: false,
            sourceId: source.sourceId,
            sourceType: source.sourceType,
            teamId: 'team-retired',
          },
        ],
        new Map(),
      ),
    ).toEqual({ action: 'retired', teamId: 'team-retired' });
  });

  it('converts a unique legacy bootstrap claim into source evidence', () => {
    expect(
      chooseTeamForSource(
        source,
        [
          { id: 'team-legacy', name: 'Structure BU2', status: 1 },
          { id: 'team-exact', name: 'StructureBU2', status: 1 },
        ],
        [],
        new Map([['DEPARTMENT:department-1', ['team-legacy']]]),
      ),
    ).toEqual({ action: 'link', teamId: 'team-legacy' });
  });

  it('does not guess when multiple normalized identities have no source proof', () => {
    expect(
      chooseTeamForSource(
        { ...source, name: 'structure_bu2' },
        [
          { id: 'team-1', name: 'Structure BU2', status: 1 },
          { id: 'team-2', name: 'StructureBU2', status: 1 },
        ],
        [],
        new Map(),
      ),
    ).toEqual({ action: 'ambiguous', teamIds: ['team-1', 'team-2'] });
  });

  it('does not adopt an exact name match without source evidence', () => {
    expect(
      chooseTeamForSource(
        source,
        [{ id: 'team-exact', name: 'StructureBU2', status: 1 }],
        [],
        new Map(),
      ),
    ).toEqual({ action: 'ambiguous', teamIds: ['team-exact'] });
  });

  it('requires explicit review even when only one duplicate has evidence', () => {
    const result = findAmbiguousTeamGroups(
      [
        { id: 'team-legacy', name: 'Structure BU2', status: 1 },
        { id: 'team-source', name: 'StructureBU2', status: 1 },
      ],
      [
        {
          isDeleted: false,
          sourceId: 'department-1',
          sourceType: 'DEPARTMENT',
          teamId: 'team-source',
        },
      ],
      new Set(),
    );

    expect(result).toEqual([
      {
        evidenceTeamIds: ['team-source'],
        nameKey: 'structurebu2',
        teamIds: ['team-legacy', 'team-source'],
      },
    ]);
  });

  it('keeps groups ambiguous when different identities have source evidence', () => {
    const result = findAmbiguousTeamGroups(
      [
        { id: 'team-department', name: 'Structure BU2', status: 1 },
        { id: 'team-supplier', name: 'StructureBU2', status: 1 },
      ],
      [
        {
          isDeleted: false,
          sourceId: 'department-1',
          sourceType: 'DEPARTMENT',
          teamId: 'team-department',
        },
      ],
      new Set(['team-supplier']),
    );

    expect(result).toEqual([
      {
        evidenceTeamIds: ['team-department', 'team-supplier'],
        nameKey: 'structurebu2',
        teamIds: ['team-department', 'team-supplier'],
      },
    ]);
  });
});
