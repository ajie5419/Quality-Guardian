import { describe, expect, it } from 'vitest';

import { validateCloseRequestBody } from './inspection-request-close.schema';

const VALID_LINKED_ISSUE = {
  defectCategoryId: 'category-surface',
  defectSubcategoryId: 'subcategory-crack',
  generateNcNumber: false,
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

  it('accepts a top-level canonical responsibility for PASS close', () => {
    expect(() =>
      validateCloseRequestBody({
        attachments: [{ name: 'record.pdf', url: '/uploads/record.pdf' }],
        responsibility: {
          responsibilityType: 'INTERNAL_DEPARTMENT',
          responsibleDepartmentId: 'dept-assembly',
        },
        result: 'PASS',
      }),
    ).not.toThrow();
  });

  it('rejects an incomplete top-level external responsibility', () => {
    expect(() =>
      validateCloseRequestBody({
        attachments: [{ name: 'record.pdf', url: '/uploads/record.pdf' }],
        responsibility: {
          responsibilityType: 'OUTSOURCING_UNIT',
        },
        result: 'PASS',
      }),
    ).toThrow('关闭外部责任单位缺少 canonical 供应商 ID');
  });

  it('accepts an outsourcing top-level responsibility without a department ID', () => {
    expect(() =>
      validateCloseRequestBody({
        attachments: [{ name: 'record.pdf', url: '/uploads/record.pdf' }],
        responsibility: {
          responsibilityType: 'OUTSOURCING_UNIT',
          supplierId: 'supplier-outsourcing',
        },
        result: 'PASS',
      }),
    ).not.toThrow();
  });

  it('allows supplier responsibility to omit a department until the request category is resolved', () => {
    expect(() =>
      validateCloseRequestBody({
        attachments: [{ name: 'record.pdf', url: '/uploads/record.pdf' }],
        responsibility: {
          responsibilityType: 'SUPPLIER',
          supplierId: 'supplier-1',
        },
        result: 'PASS',
      }),
    ).not.toThrow();
  });

  it('accepts an outsourcing linked issue without a department ID', () => {
    expect(() =>
      validateCloseRequestBody({
        linkedIssue: {
          ...VALID_LINKED_ISSUE,
          photos: ['/api/uploads/defect.jpg'],
          responsibilityType: 'OUTSOURCING_UNIT',
          responsibleDepartmentId: undefined,
          supplierId: 'supplier-outsourcing',
        },
        quantity: 2,
        result: 'FAIL',
        unqualifiedQuantity: 1,
      }),
    ).not.toThrow();
  });

  it('rejects a client-selected outsourcing department', () => {
    expect(() =>
      validateCloseRequestBody({
        attachments: [{ name: 'record.pdf', url: '/uploads/record.pdf' }],
        responsibility: {
          responsibilityType: 'OUTSOURCING_UNIT',
          responsibleDepartmentId: 'dept-client',
          supplierId: 'supplier-outsourcing',
        },
        result: 'PASS',
      }),
    ).toThrow('外协责任部门由系统配置解析');
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

  it('requires a canonical department ID for an internal responsibility type', () => {
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

  it('requires an explicit NC number generation decision', () => {
    expect(() =>
      validateCloseRequestBody({
        linkedIssue: {
          ...VALID_LINKED_ISSUE,
          generateNcNumber: undefined,
          photos: ['/api/uploads/defect.jpg'],
        },
        quantity: 2,
        result: 'FAIL',
        unqualifiedQuantity: 1,
      }),
    ).toThrow('是否生成不合格编号不能为空');
  });
});
