import { describe, expect, it } from 'vitest';
import {
  inspectionIssueListQuerySchema,
  parseInspectionIssueCreateBody,
  parseInspectionIssueUpdateBody,
} from '~/modules/inspection/inspection-issue.schema';

const validCreateBody = {
  defectCategoryId: 'defect-category-1',
  defectSubtype: '焊接缺陷',
  defectSubcategoryId: 'defect-subcategory-1',
  defectType: '制造缺陷',
  description: '发现焊缝气孔',
  partName: 'Frame',
  processName: 'Welding',
  quantity: 1,
  reportDate: '2026-07-10',
  responsibilityType: 'INTERNAL_DEPARTMENT',
  responsibleDepartmentId: 'dept-production',
  rootCause: '参数设置不正确',
  severity: 'Major',
  solution: '返修并重新检验',
  status: 'OPEN',
  workOrderNumber: 'WO-001',
};

describe('inspection issue schema', () => {
  it('normalizes and accepts a complete list date range', () => {
    expect(
      inspectionIssueListQuerySchema.parse({
        endDate: ' 2026-07-20 ',
        startDate: ' 2026-07-01 ',
      }),
    ).toMatchObject({
      endDate: '2026-07-20',
      startDate: '2026-07-01',
    });
  });

  it.each([
    [{ startDate: '2026-07-01' }, '必须同时提供'],
    [{ endDate: '2026-07-20', startDate: '2026-02-30' }, '日期格式无效'],
    [{ endDate: '2026-07-01', startDate: '2026-07-20' }, '不能晚于结束日期'],
  ])('rejects an invalid list date range', (input, message) => {
    expect(() => inspectionIssueListQuerySchema.parse(input)).toThrow(message);
  });

  it('accepts the canonical online create payload', () => {
    const result = parseInspectionIssueCreateBody({
      ...validCreateBody,
      photos: ['/api/uploads/issue.jpg'],
    });

    expect(result.responsibleDepartmentId).toBe('dept-production');
    expect(result.quantity).toBe(1);
  });

  it('accepts the complete IssueEditModal submit payload', () => {
    const result = parseInspectionIssueCreateBody({
      ...validCreateBody,
      claim: 'No',
      division: 'Vehicle Division',
      divisionId: 'dept-vehicle',
      inspector: 'Inspector Name',
      lossAmount: 12.5,
      photos: ['/api/uploads/issue.jpg'],
      projectName: 'Project A',
      responsibleWelder: 'Welder A',
      supplierId: 'supplier-1',
      responsibilityType: 'SUPPLIER',
    });

    expect(result).toMatchObject({
      claim: 'No',
      divisionId: 'dept-vehicle',
      responsibilityType: 'SUPPLIER',
      supplierId: 'supplier-1',
    });
  });

  it('rejects create input missing a required desktop field', () => {
    const { description: _description, ...input } = validCreateBody;

    expect(() => parseInspectionIssueCreateBody(input)).toThrow();
  });

  it('rejects unknown create fields', () => {
    expect(() =>
      parseInspectionIssueCreateBody({
        ...validCreateBody,
        unsupported: true,
      }),
    ).toThrow();
  });

  it.each([
    [{ responsibleDepartments: ['dept-1'] }, 'Unrecognized key'],
    [{ responsibleDepartmentId: { value: 'dept-1' } }, 'Expected string'],
    [
      { responsibilityType: 'INTERNAL_DEPARTMENT', supplierId: 'supplier-1' },
      '内部责任部门',
    ],
    [{ responsibilityType: 'SUPPLIER', supplierId: undefined }, '外部责任单位'],
  ])('rejects invalid responsibility input', (override, message) => {
    expect(() =>
      parseInspectionIssueCreateBody({ ...validCreateBody, ...override }),
    ).toThrow(message);
  });

  it('requires a responsible welder for welding process creates', () => {
    expect(() =>
      parseInspectionIssueCreateBody({
        ...validCreateBody,
        processName: '焊接',
      }),
    ).toThrow('焊接工序必须填写责任焊工');

    const result = parseInspectionIssueCreateBody({
      ...validCreateBody,
      processName: '焊接',
      responsibleWelder: 'Welder A',
    });
    expect(result.processName).toBe('焊接');
    expect(result.responsibleWelder).toBe('Welder A');
  });

  it('does not require a responsible welder for non-welding process creates', () => {
    expect(() => parseInspectionIssueCreateBody(validCreateBody)).not.toThrow();
  });

  it('accepts a partial update but rejects an empty update', () => {
    expect(parseInspectionIssueUpdateBody({ status: 'IN_PROGRESS' })).toEqual({
      status: 'IN_PROGRESS',
    });
    expect(() => parseInspectionIssueUpdateBody({})).toThrow(
      '至少提供一个可更新字段',
    );
  });
});
