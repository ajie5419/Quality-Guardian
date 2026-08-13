import { describe, expect, it } from 'vitest';

import { resolveInspectionTeamDisplay } from './inspection-team-display';

describe('resolveInspectionTeamDisplay', () => {
  it('uses the PROCESS internal responsibility department before closing', () => {
    expect(
      resolveInspectionTeamDisplay({
        category: 'PROCESS',
        responsibilityType: 'INTERNAL_DEPARTMENT',
        responsibleDepartment: 'Structure BU1',
        team: null,
      }),
    ).toBe('Structure BU1');
  });

  it('uses the canonical outsourcing supplier instead of TEAM', () => {
    expect(
      resolveInspectionTeamDisplay({
        category: 'PROCESS',
        responsibilityType: 'OUTSOURCING_UNIT',
        responsibleDepartment: 'Production OBU',
        supplierName: 'Outsourcing Unit A',
        team: 'Resident Team',
      }),
    ).toBe('Outsourcing Unit A');
  });
});
