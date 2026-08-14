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
} = vi.hoisted(() => ({
  mockGetWelderListPage: vi.fn(),
  mockHandleApiError: vi.fn(),
  mockSetFieldValue: vi.fn(),
  mockSetFormState: vi.fn(),
  mockUpdateSchema: vi.fn(),
}));

vi.mock('@vben/locales', () => ({
  $t: (key: string) => key,
  useI18n: () => ({ t: (key: string) => key }),
}));

vi.mock('#/adapter/form', () => ({
  useVbenForm: (config: {
    schema: Array<{ fieldName: string; label?: string }>;
  }) => [
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
      setState: mockSetFormState,
      setValues: vi.fn(),
      updateSchema: mockUpdateSchema,
      validate: vi.fn(),
    },
  ],
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

    expect(wrapper.text()).toContain('Generate NC Number');
    expect(wrapper.text()).not.toContain('qms.inspection.issues.ncNumber');
  });

  it('shows a read-only NC number field without the generation switch while editing', () => {
    const wrapper = mountComponent(true);

    expect(wrapper.text()).toContain('qms.inspection.issues.ncNumber');
    expect(wrapper.text()).toContain('Unnumbered');
    expect(wrapper.text()).not.toContain('Generate NC Number');
  });

  it('keeps the canonical department ID while async options supply its label', async () => {
    const wrapper = mountComponent();
    const departments = [
      {
        label: 'Production OBU',
        value: 'dept-1750026464925',
      },
    ];

    await wrapper.setProps({ deptTreeData: departments });

    expect(mockUpdateSchema).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          componentProps: expect.objectContaining({
            fieldNames: {
              children: 'children',
              label: 'label',
              value: 'value',
            },
            labelInValue: false,
            treeData: departments,
            treeNodeLabelProp: 'label',
          }),
          fieldName: 'responsibleDepartmentId',
        }),
      ]),
    );
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

  it('uses the explicit responsibility type for the supplier category', () => {
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
  });
});
