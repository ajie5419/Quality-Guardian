import { describe, expect, it } from 'vitest';

import { validateCloseRequestBody } from './inspection-request-close.schema';

const VALID_LINKED_ISSUE = {
  defectSubtype: 'crack',
  defectType: 'surface',
  description: 'defect',
  partName: 'Bearing',
  processName: 'Welding',
  responsibilityType: 'INTERNAL_DEPARTMENT',
  responsibleDepartment: 'Assembly Team A',
  responsibleDepartmentId: 'dept-assembly',
  rootCause: 'fatigue',
  severity: 'Minor',
  solution: 'rework',
  status: 'OPEN',
};

describe('validateCloseRequestBody', () => {
  it('accepts failed close issue photos submitted as URL strings', () => {
    expect(() =>
      validateCloseRequestBody({
        linkedIssue: {
          ...VALID_LINKED_ISSUE,
          photos: ['/api/uploads/defect.jpg'],
        },
        quantity: 2,
        result: 'FAIL',
        unqualifiedQuantity: 1,
      }),
    ).not.toThrow();
  });

  it('rejects failed close when linked issue photos are empty', () => {
    expect(() =>
      validateCloseRequestBody({
        linkedIssue: {
          ...VALID_LINKED_ISSUE,
          photos: [],
        },
        quantity: 2,
        result: 'FAIL',
        unqualifiedQuantity: 1,
      }),
    ).toThrow('不合格项照片不能为空');
  });

  it('keeps inspection record attachments required for pass close', () => {
    expect(() =>
      validateCloseRequestBody({
        quantity: 2,
        result: 'PASS',
      }),
    ).toThrow('检验记录不能为空');
  });

  it('rejects an unknown responsibility type', () => {
    expect(() =>
      validateCloseRequestBody({
        linkedIssue: {
          ...VALID_LINKED_ISSUE,
          photos: ['/api/uploads/defect.jpg'],
          responsibilityType: 'UNKNOWN',
        },
        quantity: 2,
        result: 'FAIL',
        unqualifiedQuantity: 1,
      }),
    ).toThrow();
  });

  it('requires a canonical department ID for an explicit responsibility type', () => {
    expect(() =>
      validateCloseRequestBody({
        linkedIssue: {
          ...VALID_LINKED_ISSUE,
          photos: ['/api/uploads/defect.jpg'],
          responsibleDepartmentId: undefined,
        },
        quantity: 2,
        result: 'FAIL',
        unqualifiedQuantity: 1,
      }),
    ).toThrow('不合格项责任部门 ID 不能为空');
  });

  it('rejects supplier identity fields for an internal department', () => {
    expect(() =>
      validateCloseRequestBody({
        linkedIssue: {
          ...VALID_LINKED_ISSUE,
          photos: ['/api/uploads/defect.jpg'],
          supplierId: 'supplier-1',
        },
        quantity: 2,
        result: 'FAIL',
        unqualifiedQuantity: 1,
      }),
    ).toThrow('内部责任部门不能同时指定供应商 ID');
  });
});
