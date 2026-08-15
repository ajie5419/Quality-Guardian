import { mount } from '@vue/test-utils';
import { defineComponent, h, ref } from 'vue';

import { INSPECTION_ISSUE_RESPONSIBILITY_TYPE } from '@qgs/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import IssueFormFields from './IssueFormFields.vue';
import { buildInspectionIssuePayload } from './issueFormPayload';

const {
  mockGetWelderListPage,
  mockHandleApiError,
  mockSetFieldValue,
  mockSetFormState,
  mockUpdateSchema,
  mockFormStates,
} = vi.hoisted(() => ({
  mockGetWelderListPage: vi.fn(),
  mockHandleApiError: vi.fn(),
  mockSetFieldValue: vi.fn(),
  mockSetFormState: vi.fn(),
  mockUpdateSchema: vi.fn(),
  mockFormStates: [] as Array<{
    schema: Array<{
      componentProps?: Record<string, unknown>;
      fieldName: string;
      label?: string;
    }>;
  }>,
}));

vi.mock('@vben/locales', () => ({
  $t: (key: string) => key,
  useI18n: () => ({ t: (key: string) => key }),
}));

vi.mock('#/adapter/form', () => ({
  useVbenForm: (config: {
    schema: Array<{
      componentProps?: Record<string, unknown>;
      fieldName: string;
      label?: string;
    }>;
  }) => {
    const state = { schema: [...config.schema] };
    mockFormStates.push(state);

    return [
      defineComponent({
        name: 'MockVbenForm',
        setup(_, { slots }) {
          return () =>
            h('div', [
              ...config.schema.map((field) => h('span', field.label || '')),
              ...(config.schema.some((field) => field.fieldName === 'ncNumber')
                ? [slots.ncNumber?.({ modelValue: '' })]
                : []),
              slots.supplierId?.({ value: undefined }),
              slots['description-label']?.(),
            ]);
        },
      }),
      {
        getValues: vi.fn(),
        resetForm: vi.fn(),
        setFieldValue: mockSetFieldValue,
        setState: (nextState: { schema?: typeof state.schema }) => {
          mockSetFormState(nextState);
          if (nextState.schema) state.schema = [...nextState.schema];
        },
        setValues: vi.fn(),
        updateSchema: (updates: Array<(typeof state.schema)[number]>) => {
          mockUpdateSchema(updates);
          const updateMap = new Map(
            updates.map((update) => [update.fieldName, update]),
          );
          state.schema = state.schema.map((field) => {
            const update = updateMap.get(field.fieldName);
            if (!update) return field;
            return {
              ...field,
              ...update,
              componentProps: {
                ...field.componentProps,
                ...update.componentProps,
              },
            };
          });
        },
        validate: vi.fn(),
      },
    ];
  },
}));

vi.mock('#/api/qms/welder', () => ({
  getWelderListPage: mockGetWelderListPage,
}));

vi.mock('#/hooks/useErrorHandler', () => ({
  useErrorHandler: () => ({ handleApiError: mockHandleApiError }),
}));

vi.mock('../../../shared/composables/useQualityClassificationOptions', () => ({
  useQualityClassificationOptions: () => ({
    loadOptions: vi.fn(),
    loading: ref(false),
    options: ref([]),
  }),
}));

vi.mock('../composables/useAiAnalysis', () => ({
  useAiAnalysis: () => ({
    analyzeIssue: vi.fn(),
    applyCaseSolution: vi.fn(),
    clearMatchedCases: vi.fn(),
    isAiAnalyzing: { value: false },
    isMatchingCases: { value: false },
    matchHistory: vi.fn(),
    matchedCases: { value: [] },
  }),
}));

vi.mock('ant-design-vue', () => ({
  Button: defineComponent({
    name: 'MockButton',
    setup(_, { slots }) {
      return () => h('button', slots.default?.());
    },
  }),
  Select: defineComponent({
    name: 'MockSelect',
    setup() {
      return () => h('select');
    },
  }),
  Tooltip: defineComponent({
    name: 'MockTooltip',
    setup(_, { slots }) {
      return () => h('span', slots.default?.());
    },
  }),
}));

vi.mock('../../../shared/components/SupplierSelect.vue', () => ({
  default: defineComponent({
    name: 'MockSupplierSelect',
    props: {
      category: String,
      legacyName: String,
      valueMode: String,
    },
    emits: ['change'],
    setup() {
      return () => h('div');
    },
  }),
}));

vi.mock('../../../shared/components/WorkOrderSelect.vue', () => ({
  default: defineComponent({
    name: 'MockWorkOrderSelect',
    setup() {
      return () => h('div');
    },
  }),
}));

vi.mock('./IssuePhotoUpload.vue', () => ({
  default: defineComponent({
    name: 'MockIssuePhotoUpload',
    setup() {
      return () => h('div');
    },
  }),
}));

vi.mock('./IssueSimilarCases.vue', () => ({
  default: defineComponent({
    name: 'MockIssueSimilarCases',
    setup() {
      return () => h('div');
    },
  }),
}));

describe('issue form fields responsibility contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFormStates.length = 0;
    mockGetWelderListPage.mockResolvedValue({ items: [] });
  });

  function mountComponent(isEditMode = false) {
    return mount(IssueFormFields, {
      props: {
        deptTreeData: [],
        isEditMode,
        processOptions: [],
        statusOptions: [],
      },
    });
  }

  it('shows the automatic NC number generation switch only while creating', () => {
    const wrapper = mountComponent(false);

    expect(wrapper.text()).toContain('生成不合格编号');
    expect(wrapper.text()).not.toContain('qms.inspection.issues.ncNumber');
  });

  it('shows a read-only NC number field without the generation switch while editing', () => {
    const wrapper = mountComponent(true);

    expect(wrapper.text()).toContain('qms.inspection.issues.ncNumber');
    expect(wrapper.text()).toContain('Unnumbered');
    expect(wrapper.text()).not.toContain('生成不合格编号');
  });

  it('keeps async department options after the edit schema is rebuilt', async () => {
    const wrapper = mountComponent();
    const departments = [
      {
        title: 'Production OBU',
        value: 'dept-1750026464925',
      },
    ];

    await wrapper.setProps({ deptTreeData: departments });
    await wrapper.setProps({ isEditMode: true });

    const state = mockFormStates[mockFormStates.length - 1];
    const departmentField = state?.schema.find(
      (field) => field.fieldName === 'responsibleDepartmentId',
    );
    const rebuiltSchema = mockSetFormState.mock.calls.at(-1)?.[0]?.schema;
    const rebuiltDepartmentField = rebuiltSchema?.find(
      (field: { fieldName: string }) =>
        field.fieldName === 'responsibleDepartmentId',
    );
    expect(rebuiltDepartmentField?.componentProps).toMatchObject({
      treeData: departments,
    });
    expect(departmentField?.componentProps).toMatchObject({
      labelInValue: false,
      treeData: departments,
      treeNodeLabelProp: 'title',
    });
    expect(
      buildInspectionIssuePayload({
        description: 'Surface scratch',
        responsibilityType: 'INTERNAL_DEPARTMENT',
        responsibleDepartmentId: 'dept-1750026464925',
      }).responsibleDepartmentId,
    ).toBe('dept-1750026464925');
  });

  it('writes the supplier id and name snapshot together', async () => {
    const wrapper = mountComponent(false);
    const supplierSelect = wrapper.findComponent({
      name: 'MockSupplierSelect',
    });

    expect(supplierSelect.props('valueMode')).toBe('id');
    supplierSelect.vm.$emit('change', 'supplier-1', {
      item: { id: 'supplier-1', name: 'Supplier A' },
    });
    await wrapper.vm.$nextTick();

    expect(mockSetFieldValue).toHaveBeenCalledWith('supplierId', 'supplier-1');
    expect(mockSetFieldValue).toHaveBeenCalledWith(
      'supplierName',
      'Supplier A',
    );
  });

  it('keeps explicit responsibility fields locked after a schema rebuild', () => {
    const wrapper = mount(IssueFormFields, {
      props: {
        deptTreeData: [],
        responsibilityType:
          INSPECTION_ISSUE_RESPONSIBILITY_TYPE.OUTSOURCING_UNIT,
      },
    });

    expect(
      wrapper.findComponent({ name: 'MockSupplierSelect' }).props('category'),
    ).toBe('Outsourcing');
    const state = mockFormStates[mockFormStates.length - 1];
    const responsibilityFields = [
      'responsibilityType',
      'responsibleDepartmentId',
      'supplierId',
    ];
    for (const fieldName of responsibilityFields) {
      expect(
        state?.schema.find((field) => field.fieldName === fieldName)
          ?.componentProps?.disabled,
      ).toBe(true);
    }
  });

  it('removes the required department field for embedded outsourcing close', () => {
    mount(IssueFormFields, {
      props: {
        deptTreeData: [],
        hideResponsibilityDepartment: true,
        mode: 'embedded',
        responsibilityType:
          INSPECTION_ISSUE_RESPONSIBILITY_TYPE.OUTSOURCING_UNIT,
      },
    });

    const schema = mockSetFormState.mock.calls
      .map((call) => call[0]?.schema)
      .find((value) => Array.isArray(value));
    const departmentField = schema?.find(
      (field: { fieldName: string }) =>
        field.fieldName === 'responsibleDepartmentId',
    );
    expect(departmentField).toMatchObject({
      dependencies: expect.objectContaining({
        show: expect.any(Function),
      }),
      rules: undefined,
    });
    expect(mockSetFieldValue).toHaveBeenCalledWith(
      'responsibleDepartmentId',
      undefined,
    );
  });

  it('does not retain supplier as an available embedded PROCESS choice', () => {
    mount(IssueFormFields, {
      props: {
        deptTreeData: [],
        mode: 'embedded',
        responsibilityTypeOptions: [
          {
            label: '内部部门',
            value: INSPECTION_ISSUE_RESPONSIBILITY_TYPE.INTERNAL_DEPARTMENT,
          },
          {
            label: '外协单位',
            value: INSPECTION_ISSUE_RESPONSIBILITY_TYPE.OUTSOURCING_UNIT,
          },
        ],
      },
    });

    expect(mockUpdateSchema).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          componentProps: expect.objectContaining({
            options: [
              {
                label: '内部部门',
                value: INSPECTION_ISSUE_RESPONSIBILITY_TYPE.INTERNAL_DEPARTMENT,
              },
              {
                label: '外协单位',
                value: INSPECTION_ISSUE_RESPONSIBILITY_TYPE.OUTSOURCING_UNIT,
              },
            ],
          }),
          fieldName: 'responsibilityType',
        }),
      ]),
    );
  });

  it('keeps the welder name text separate from the canonical id select', () => {
    mount(IssueFormFields, {
      props: {
        deptTreeData: [],
        processOptions: [],
        statusOptions: [],
      },
    });

    const state = mockFormStates[mockFormStates.length - 1];
    const welderNameField = state?.schema.find(
      (field) => field.fieldName === 'responsibleWelder',
    );
    const welderIdField = state?.schema.find(
      (field) => field.fieldName === 'responsibleWelderId',
    );

    // The name snapshot is a plain (hidden) text field, never a select whose
    // value would leak the welder id into the display.
    expect(welderNameField).toMatchObject({
      component: 'Input',
    });
    expect(welderIdField).toMatchObject({
      component: 'Select',
      rules: 'selectRequired',
    });
  });
});
