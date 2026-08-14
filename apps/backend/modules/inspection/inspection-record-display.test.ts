import { describe, expect, it } from 'vitest';

import {
  requiresLinkedInternalResponsibility,
  resolveInspectionRecordTeamDisplay,
} from './inspection-record-display';

describe('resolveInspectionRecordTeamDisplay', () => {
  it('uses the internal responsibility department as the PROCESS team label', () => {
    expect(
      resolveInspectionRecordTeamDisplay({
        category: 'PROCESS',
        responsibilityType: 'INTERNAL_DEPARTMENT',
        responsibleDepartment: 'Machining BU',
        team: 'Legacy execution team',
      }),
    ).toBe('Machining BU');
  });

  it('uses the outsourcing supplier display for PROCESS external records', () => {
    expect(
      resolveInspectionRecordTeamDisplay({
        category: 'PROCESS',
        responsibilityType: 'OUTSOURCING_UNIT',
        responsibleDepartment: 'Production OBU',
        supplierName: 'Outsourcing Unit A',
        team: 'Resident Team',
      }),
    ).toBe('Outsourcing Unit A');
  });

  it('uses one linked internal request department when the record fact is missing', () => {
    expect(
      resolveInspectionRecordTeamDisplay({
        category: 'PROCESS',
        linkedInternalResponsibleDepartment: 'Structure BU',
        team: 'Legacy execution team',
      }),
    ).toBe('Structure BU');
  });

  it('fails closed when linked internal requests disagree', () => {
    expect(
      resolveInspectionRecordTeamDisplay({
        category: 'PROCESS',
        linkedInternalResponsibilityUnresolved: true,
        team: 'Legacy execution team',
      }),
    ).toBeNull();
  });

  it('only resolves linked responsibility for a missing PROCESS fact', () => {
    expect(
      requiresLinkedInternalResponsibility({
        category: 'PROCESS',
        responsibilityType: 'OUTSOURCING_UNIT',
      }),
    ).toBe(false);
  });
});
