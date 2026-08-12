import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildLegacySourceClaims,
  collectTeamSourceCandidates,
  parseTeamIdentityReconciliationOptions,
} from './team-identity-reconciliation';

const { warn } = vi.hoisted(() => ({ warn: vi.fn() }));

vi.mock('~/utils/logger', () => ({
  createModuleLogger: vi.fn().mockReturnValue({ warn }),
}));

describe('team identity reconciliation', () => {
  beforeEach(() => {
    warn.mockReset();
  });

  it('keeps source identities separate instead of deduplicating by name', () => {
    const candidates = collectTeamSourceCandidates(
      [
        {
          id: 'department-1',
          name: 'Structure BU2',
          parentId: '0',
          sort: 1,
        },
        {
          id: 'department-2',
          name: 'StructureBU2',
          parentId: '0',
          sort: 2,
        },
      ],
      [],
    );

    expect(candidates).toHaveLength(2);
    expect(candidates.map((candidate) => candidate.sourceId)).toEqual([
      'department-1',
      'department-2',
    ]);
  });

  it('reads a single independently attributable legacy source', () => {
    expect(
      buildLegacySourceClaims([
        {
          id: 'team-1',
          remark: JSON.stringify({
            managedBy: 'system:team-dictionary-bootstrap',
            sources: ['department:department-1'],
          }),
        },
      ]),
    ).toEqual(new Map([['DEPARTMENT:department-1', ['team-1']]]));
  });

  it('rejects legacy remarks that coalesced multiple source identities', () => {
    expect(
      buildLegacySourceClaims([
        {
          id: 'team-1',
          remark: JSON.stringify({
            managedBy: 'system:team-dictionary-bootstrap',
            sources: ['department:department-1', 'supplier:supplier-1'],
          }),
        },
      ]),
    ).toEqual(new Map());
  });

  it('rejects untrusted or malformed legacy source claims', () => {
    expect(
      buildLegacySourceClaims([
        {
          id: 'team-untrusted',
          remark: JSON.stringify({
            managedBy: 'manual-edit',
            sources: ['department:department-1'],
          }),
        },
        {
          id: 'team-malformed',
          remark: JSON.stringify({
            managedBy: 'system:team-dictionary-bootstrap',
            sources: ['department:', 'other:source-1'],
          }),
        },
      ]),
    ).toEqual(new Map());
  });

  it('silently ignores ordinary legacy remarks that are not JSON metadata', () => {
    expect(
      buildLegacySourceClaims([
        { id: 'team-legacy-text', remark: 'Legacy note from an operator' },
      ]),
    ).toEqual(new Map());
    expect(warn).not.toHaveBeenCalled();
  });

  it('warns when a JSON-shaped legacy remark is syntactically corrupt', () => {
    expect(
      buildLegacySourceClaims([
        {
          id: 'team-corrupt-json',
          remark: '{"managedBy":"system:team-dictionary-bootstrap",',
        },
      ]),
    ).toEqual(new Map());
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ teamId: 'team-corrupt-json' }),
      'ignored invalid legacy TEAM remark',
    );
  });

  it('parses apply mode and rejects unknown options', () => {
    expect(parseTeamIdentityReconciliationOptions(['--apply'])).toEqual({
      mode: 'apply',
    });
    expect(() =>
      parseTeamIdentityReconciliationOptions(['--batch-size=100']),
    ).toThrow('unknown argument: --batch-size=100');
  });
});
