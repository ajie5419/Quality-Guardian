import { mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import IssueFormFields from './IssueFormFields.vue';

const {
  mockGenerateInspectionNcNumber,
  mockGetWelderListPage,
  mockHandleApiError,
  mockSetFieldValue,
  mockWarning,
} = vi.hoisted(() => ({
  mockGenerateInspectionNcNumber: vi.fn(),
  mockGetWelderListPage: vi.fn(),
  mockHandleApiError: vi.fn(),
  mockSetFieldValue: vi.fn(),
  mockWarning: vi.fn(),
}));

vi.mock('@vben/locales', () => ({
  $t: (key: string) => key,
  useI18n: () => ({
    t: (key: string) =>
      ({
        'qms.inspection.issues.generateNumber': '生成编号',
        'qms.inspection.issues.generateNumberPlaceholder':
          '需要时点击右侧按钮生成',
      })[key] || key,
  }),
}));

vi.mock('#/adapter/form', () => ({
  useVbenForm: () => [
    defineComponent({
      name: 'MockVbenForm',
      setup(_, { slots }) {
        return () =>
          h('div', [
            slots.ncNumber?.({ modelValue: '' }),
            slots.supplierId?.({ value: undefined }),
            slots['description-label']?.(),
          ]);
      },
    }),
    {
      getValues: vi.fn(),
      resetForm: vi.fn(),
      setFieldValue: mockSetFieldValue,
      setValues: vi.fn(),
      updateSchema: vi.fn(),
      validate: vi.fn(),
    },
  ],
}));

vi.mock('#/api/qms/inspection', () => ({
  generateInspectionNcNumber: mockGenerateInspectionNcNumber,
}));

vi.mock('#/api/qms/welder', () => ({
  getWelderListPage: mockGetWelderListPage,
}));

vi.mock('#/hooks/useErrorHandler', () => ({
  useErrorHandler: () => ({ handleApiError: mockHandleApiError }),
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
    props: {
      loading: {
        default: false,
        type: [Boolean, Object],
      },
      size: {
        default: '',
        type: String,
      },
      type: {
        default: '',
        type: String,
      },
    },
    emits: ['click'],
    setup(_, { emit, slots }) {
      return () =>
        h('button', { onClick: () => emit('click') }, slots.default?.());
    },
  }),
  Select: defineComponent({
    name: 'MockSelect',
    setup() {
      return () => h('select');
    },
  }),
  Switch: defineComponent({
    name: 'MockSwitch',
    setup() {
      return () => h('input', { type: 'checkbox' });
    },
  }),
  Tooltip: defineComponent({
    name: 'MockTooltip',
    setup(_, { slots }) {
      return () => h('span', slots.default?.());
    },
  }),
  message: {
    warning: mockWarning,
  },
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

describe('issue form fields nc number controls', () => {
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

  it('shows an explicit generate number button in create mode', () => {
    const wrapper = mountComponent(false);

    expect(wrapper.text()).toContain('生成编号');
    expect(wrapper.text()).toContain('自动生成');
  });

  it('generates and fills an NC number when the button is clicked', async () => {
    mockGenerateInspectionNcNumber.mockResolvedValueOnce({
      ncNumber: 'NC-2026-001',
    });
    const wrapper = mountComponent(false);

    await wrapper.get('button').trigger('click');
    await Promise.resolve();

    expect(mockGenerateInspectionNcNumber).toHaveBeenCalledTimes(1);
    expect(mockSetFieldValue).toHaveBeenCalledWith('ncNumber', 'NC-2026-001');
  });

  it('hides generate number controls in edit mode', () => {
    const wrapper = mountComponent(true);

    expect(wrapper.text()).not.toContain('生成编号');
    expect(wrapper.text()).not.toContain('自动生成');
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
});
