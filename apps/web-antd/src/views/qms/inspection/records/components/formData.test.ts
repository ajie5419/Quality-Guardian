import { describe, expect, it } from 'vitest';

import { buildTeamIdentityFields, getFormSchema } from './formData';

describe('inspection record form schema', () => {
  it('binds incoming suppliers by canonical id', () => {
    const supplierField = getFormSchema('incoming').find(
      (field) => field.fieldName === 'supplierId',
    );

    expect(supplierField).toEqual(
      expect.objectContaining({
        component: 'SupplierSelect',
        label: '单位',
        modelPropName: 'value',
        rules: 'required',
      }),
    );
    expect(
      getFormSchema('incoming').some(
        (field) => field.fieldName === 'supplierName',
      ),
    ).toBe(false);
  });

  it('binds process teams by canonical id', () => {
    const schema = getFormSchema('process');
    const teamField = schema.find((field) => field.fieldName === 'teamId');

    expect(teamField).toEqual(
      expect.objectContaining({
        component: 'TeamSelect',
        modelPropName: 'value',
        rules: 'required',
      }),
    );
    expect(schema.some((field) => field.fieldName === 'team')).toBe(false);
  });

  it('builds canonical team id and name snapshot fields', () => {
    expect(
      buildTeamIdentityFields(' team-1 ', { label: ' Assembly Team ' }),
    ).toEqual({
      team: 'Assembly Team',
      teamId: 'team-1',
    });
    expect(buildTeamIdentityFields(undefined)).toEqual({
      team: undefined,
      teamId: undefined,
    });
  });
});
