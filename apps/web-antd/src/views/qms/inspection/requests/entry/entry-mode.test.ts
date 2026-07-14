import { describe, expect, it } from 'vitest';

import { mapInspectionRequestEntryTeamOptions } from './entry-mode';

describe('inspection request entry identity options', () => {
  it('keeps canonical TEAM IDs as selector values', () => {
    expect(
      mapInspectionRequestEntryTeamOptions([
        { group: 'internal', label: 'Internal Team', value: 'team-1' },
        { group: 'external', label: 'Resident Team', value: 'team-2' },
      ]),
    ).toEqual([
      {
        label: '内部生产车间',
        options: [{ label: 'Internal Team', value: 'team-1' }],
      },
      {
        label: '外协加工单位',
        options: [{ label: 'Resident Team', value: 'team-2' }],
      },
    ]);
  });
});
