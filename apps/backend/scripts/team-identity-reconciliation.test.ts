import { describe, expect, it } from 'vitest';

import {
  buildLegacySourceClaims,
  collectTeamSourceCandidates,
  parseTeamIdentityReconciliationOptions,
} from './team-identity-reconciliation';

describe('team identity reconciliation', () => {
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

  it('reads source IDs from the legacy bootstrap remark', () => {
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
    ).toEqual(
      new Map([
        ['DEPARTMENT:department-1', ['team-1']],
        ['SUPPLIER:supplier-1', ['team-1']],
      ]),
    );
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

  it('parses apply mode and rejects unknown options', () => {
    expect(parseTeamIdentityReconciliationOptions(['--apply'])).toEqual({
      mode: 'apply',
    });
    expect(() =>
      parseTeamIdentityReconciliationOptions(['--batch-size=100']),
    ).toThrow('unknown argument: --batch-size=100');
  });
});
