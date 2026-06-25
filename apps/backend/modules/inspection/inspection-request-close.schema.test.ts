import { describe, expect, it } from 'vitest';

import { validateCloseRequestBody } from './inspection-request-close.schema';

const VALID_LINKED_ISSUE = {
  defectSubtype: 'crack',
  defectType: 'surface',
  description: 'defect',
  partName: 'Bearing',
  processName: 'Welding',
  responsibleDepartment: 'Assembly Team A',
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
    ).toThrow('VALIDATION:不合格项照片不能为空');
  });

  it('keeps inspection record attachments required for pass close', () => {
    expect(() =>
      validateCloseRequestBody({
        quantity: 2,
        result: 'PASS',
      }),
    ).toThrow('VALIDATION:检验记录不能为空');
  });
});
