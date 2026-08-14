import { describe, expect, it, vi } from 'vitest';

import {
  getIssueFormSchema,
  isWeldingDefectSubcategory,
  isWeldingProcessName,
  RESPONSIBLE_DEPARTMENT_TREE_SELECT_PROPS,
} from './issueFormData';

vi.mock('@vben/locales', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

const CLASSIFICATIONS = [
  {
    code: 'MANUFACTURING_DEFECT',
    id: 'cat-manufacturing',
    name: '制造缺陷',
    scope: 'INSPECTION_ISSUE_DEFECT' as const,
    sort: 1,
    status: 1 as const,
    subcategories: [
      {
        code: 'WELDING_DEFECT',
        id: 'sub-welding',
        name: '焊接缺陷',
        sort: 1,
        status: 1 as const,
      },
      {
        code: 'SURFACE_DEFECT',
        id: 'sub-surface',
        name: '表面缺陷',
        sort: 2,
        status: 1 as const,
      },
    ],
  },
];

describe('issue form welding conditions', () => {
  it('recognizes welding process names by the 焊 keyword', () => {
    expect(isWeldingProcessName('焊接')).toBe(true);
    expect(isWeldingProcessName('探伤')).toBe(false);
    expect(isWeldingProcessName('')).toBe(false);
  });

  it('recognizes welding defect subcategories by name', () => {
    expect(isWeldingDefectSubcategory('sub-welding', CLASSIFICATIONS)).toBe(
      true,
    );
    expect(isWeldingDefectSubcategory('sub-surface', CLASSIFICATIONS)).toBe(
      false,
    );
    expect(isWeldingDefectSubcategory('', CLASSIFICATIONS)).toBe(false);
  });

  it('recognizes welding defect subcategories by stable code after a rename', () => {
    const welding = CLASSIFICATIONS[0]!.subcategories[0]!;
    const surface = CLASSIFICATIONS[0]!.subcategories[1]!;
    const renamed = [
      {
        ...CLASSIFICATIONS[0]!,
        subcategories: [
          {
            ...welding,
            name: '焊缝缺陷',
          },
          surface,
        ],
      },
    ];
    expect(isWeldingDefectSubcategory('sub-welding', renamed)).toBe(true);
    expect(
      isWeldingDefectSubcategory('sub-surface', [
        {
          ...CLASSIFICATIONS[0]!,
          subcategories: [{ ...surface, code: 'SURFACE' }],
        },
      ]),
    ).toBe(false);
  });

  it('uses a single canonical TreeSelect department field', () => {
    const schema = getIssueFormSchema();
    const department = schema.find(
      (field) => field.fieldName === 'responsibleDepartmentId',
    );

    expect(department?.component).toBe('TreeSelect');
    expect(department?.componentProps).not.toMatchObject({
      treeCheckable: true,
    });
    expect(department?.componentProps).not.toMatchObject({
      treeCheckStrictly: true,
    });
    expect(
      schema.some((field) => field.fieldName === 'responsibleDepartments'),
    ).toBe(false);
    expect(department?.componentProps).toMatchObject(
      RESPONSIBLE_DEPARTMENT_TREE_SELECT_PROPS,
    );
    expect(department?.componentProps).toMatchObject({
      labelInValue: false,
      treeNodeLabelProp: 'title',
    });
  });

  it('only exposes automatic number generation while creating an issue', () => {
    const createSchema = getIssueFormSchema();
    const editSchema = getIssueFormSchema(undefined, [], true);

    expect(
      createSchema.some((field) => field.fieldName === 'generateNcNumber'),
    ).toBe(true);
    expect(createSchema.some((field) => field.fieldName === 'ncNumber')).toBe(
      false,
    );
    expect(editSchema.some((field) => field.fieldName === 'ncNumber')).toBe(
      true,
    );
    expect(
      editSchema.some((field) => field.fieldName === 'generateNcNumber'),
    ).toBe(false);

    const generateNcNumber = createSchema.find(
      (field) => field.fieldName === 'generateNcNumber',
    );
    expect(generateNcNumber?.componentProps).toMatchObject({
      class: '!w-auto',
      style: { width: 'auto' },
    });
    expect(generateNcNumber?.label).toBe('生成不合格编号');
  });
});
