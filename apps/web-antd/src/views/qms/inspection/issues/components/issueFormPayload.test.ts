import { describe, expect, it } from 'vitest';

import {
  buildInspectionIssuePayload,
  isExternalInspectionIssueResponsibility,
  normalizeInspectionIssueCanonicalId,
} from './issueFormPayload';

const BASE_ISSUE = {
  description: 'Surface scratch',
  generateNcNumber: true,
  ncNumber: 'NC-client-generated',
  responsibleDepartment: '生产 OBU',
  responsibleDepartments: ['dept-production'],
  responsibleDepartmentId: 'dept-production',
  supplierName: 'Supplier display snapshot',
};

describe('inspection issue payload assembler', () => {
  it.each([
    ['INTERNAL_DEPARTMENT', undefined],
    ['SUPPLIER', 'supplier-1'],
    ['OUTSOURCING_UNIT', 'supplier-1'],
  ] as const)(
    'uses the same canonical contract for standalone and request entries: %s',
    (responsibilityType, supplierId) => {
      const standalonePayload = buildInspectionIssuePayload({
        ...BASE_ISSUE,
        responsibilityType,
        supplierId,
      });
      const requestPayload = buildInspectionIssuePayload({
        ...BASE_ISSUE,
        responsibilityType,
        supplierId,
      });

      expect(requestPayload).toEqual(standalonePayload);
      expect(standalonePayload).toMatchObject({
        description: 'Surface scratch',
        generateNcNumber: true,
        responsibilityType,
        responsibleDepartmentId: 'dept-production',
      });
      expect(standalonePayload).not.toHaveProperty('ncNumber');
      expect(standalonePayload).not.toHaveProperty('responsibleDepartment');
      expect(standalonePayload).not.toHaveProperty('responsibleDepartments');
      expect(standalonePayload).not.toHaveProperty('supplierName');
      if (supplierId) {
        expect(standalonePayload.supplierId).toBe(supplierId);
      } else {
        expect(standalonePayload).not.toHaveProperty('supplierId');
      }
    },
  );

  it('never converts a TreeSelect labelled object into [object Object]', () => {
    const labelledValue = { label: '生产 OBU', value: 'dept-production' };
    const payload = buildInspectionIssuePayload({
      ...BASE_ISSUE,
      responsibilityType: 'INTERNAL_DEPARTMENT',
      responsibleDepartmentId: labelledValue,
      supplierId: labelledValue,
    });

    expect(normalizeInspectionIssueCanonicalId(labelledValue)).toBe('');
    expect(payload.responsibleDepartmentId).toBe('');
    expect(JSON.stringify(payload)).not.toContain('[object Object]');
  });

  it('uses supplier selection only for external responsibility types', () => {
    expect(isExternalInspectionIssueResponsibility('INTERNAL_DEPARTMENT')).toBe(
      false,
    );
    expect(isExternalInspectionIssueResponsibility('SUPPLIER')).toBe(true);
    expect(isExternalInspectionIssueResponsibility('OUTSOURCING_UNIT')).toBe(
      true,
    );
  });
});
