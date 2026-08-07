import type { DuplicateMergePlanTeam } from './team-duplicate-merge-plan';

import { describe, expect, it } from 'vitest';

import { planConfirmedDuplicateMerges } from './team-duplicate-merge-plan';

function team(
  id: string,
  name: string,
  sourceKeys: string[] = [],
  status = 1,
): DuplicateMergePlanTeam {
  return { id, name, sourceKeys, status };
}

describe('planConfirmedDuplicateMerges', () => {
  it('merges whitespace variants into the department-leaf canonical', () => {
    const plans = planConfirmedDuplicateMerges(
      [team('t-space', '结构 BU1'), team('t-compact', '结构BU1')],
      [{ id: 'dept-1', name: '结构 BU1' }],
    );
    expect(plans).toEqual([
      expect.objectContaining({
        evidence: 'department-leaf-name',
        sourceTeamId: 't-compact',
        targetTeamId: 't-space',
      }),
    ]);
  });

  it('merges business-confirmed workshop names into the BU canonical', () => {
    const plans = planConfirmedDuplicateMerges(
      [team('t-bu', '机加 BU'), team('t-ws', '机加车间')],
      [{ id: 'dept-1', name: '机加 BU' }],
    );
    expect(plans).toHaveLength(1);
    expect(plans[0]).toMatchObject({
      evidence: 'business-confirmed',
      sourceTeamId: 't-ws',
      targetTeamId: 't-bu',
    });
  });

  it('skips a business rule when the canonical name is ambiguous', () => {
    const plans = planConfirmedDuplicateMerges(
      [
        team('t-bu-a', '机加 BU'),
        team('t-bu-b', '机加 BU'),
        team('t-ws', '机加车间'),
      ],
      [],
    );
    expect(plans).toHaveLength(0);
  });

  it('uses a live source link when no department leaf matches', () => {
    const plans = planConfirmedDuplicateMerges(
      [
        team('t-source', 'Alpha', ['DEPARTMENT:dept-9']),
        team('t-other', 'Alpha '),
      ],
      [],
    );
    expect(plans).toHaveLength(1);
    expect(plans[0]).toMatchObject({
      evidence: 'source-link',
      sourceTeamId: 't-other',
      targetTeamId: 't-source',
    });
  });

  it('skips groups without source evidence', () => {
    const plans = planConfirmedDuplicateMerges(
      [team('a', 'X'), team('b', 'X')],
      [],
    );
    expect(plans).toHaveLength(0);
  });

  it('skips groups with conflicting leaf and source-link evidence', () => {
    const plans = planConfirmedDuplicateMerges(
      [
        team('t-leaf', '结构 BU1'),
        team('t-linked', '结构 BU1', ['DEPARTMENT:dept-9']),
        team('t-compact', '结构BU1'),
      ],
      [{ id: 'dept-1', name: '结构 BU1' }],
    );
    expect(plans).toHaveLength(0);
  });

  it('is idempotent: retired sources are not re-planned', () => {
    const plans = planConfirmedDuplicateMerges(
      [team('t-space', '结构 BU1'), team('t-compact', '结构BU1', [], 0)],
      [{ id: 'dept-1', name: '结构 BU1' }],
    );
    expect(plans).toHaveLength(0);
  });
});
