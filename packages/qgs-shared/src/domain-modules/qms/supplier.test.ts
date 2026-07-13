import type { SupplierInspectionPolicy } from './supplier';

import { describe, expect, it } from 'vitest';

import { resolveSupplierInspectionPolicy } from './supplier';

const incomingSupplierPolicy: SupplierInspectionPolicy = {
  identitySource: 'supplier',
  inspectionCategory: 'INCOMING',
  profileSource: 'incoming',
};

const processTeamPolicy: SupplierInspectionPolicy = {
  identitySource: 'team',
  inspectionCategory: 'PROCESS',
  profileSource: 'process',
};

describe('resolveSupplierInspectionPolicy', () => {
  it('uses incoming supplier records for a regular supplier', () => {
    expect(
      resolveSupplierInspectionPolicy({
        category: 'Supplier',
        outsourcingMode: 'IN_HOUSE_TEAM',
      }),
    ).toEqual(incomingSupplierPolicy);
  });

  it('uses incoming supplier records for an external processor', () => {
    expect(
      resolveSupplierInspectionPolicy({
        category: 'Outsourcing',
        outsourcingMode: 'EXTERNAL_PROCESSOR',
      }),
    ).toEqual(incomingSupplierPolicy);
  });

  it('defaults an outsourcing unit without a mode to external processing', () => {
    expect(
      resolveSupplierInspectionPolicy({ category: ' outsourcing ' }),
    ).toEqual(incomingSupplierPolicy);
  });

  it.each(['IN_HOUSE_TEAM', 'in-house team', '驻厂队伍'])(
    'uses process team records for in-house alias %s',
    (outsourcingMode) => {
      expect(
        resolveSupplierInspectionPolicy({
          category: 'Outsourcing',
          outsourcingMode,
        }),
      ).toEqual(processTeamPolicy);
    },
  );

  it.each(['EXTERNAL_SERVICE', 'external service', '外部服务'])(
    'uses process team records for external service alias %s',
    (outsourcingMode) => {
      expect(
        resolveSupplierInspectionPolicy({
          category: 'Outsourcing',
          outsourcingMode,
        }),
      ).toEqual(processTeamPolicy);
    },
  );

  it('falls back to external processing for an unknown outsourcing mode', () => {
    expect(
      resolveSupplierInspectionPolicy({
        category: 'Outsourcing',
        outsourcingMode: 'unknown-mode',
      }),
    ).toEqual(incomingSupplierPolicy);
  });
});
