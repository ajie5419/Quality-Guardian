// @vitest-environment happy-dom

import type {
  InspectionIssueResponsibilityType,
  InspectionRequest,
  InspectionRequestAttachment,
} from '@qgs/shared';
import type { UploadFile } from 'ant-design-vue';

import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import CloseInspectionModal from './CloseInspectionModal.vue';

const { mockGetResponsibilityOptions, mockMessageError, mockSetValues } =
  vi.hoisted(() => ({
    mockGetResponsibilityOptions: vi.fn(),
    mockMessageError: vi.fn(),
    mockSetValues: vi.fn(),
  }));

vi.mock('ant-design-vue', () => {
  const passthrough = (name: string) =>
    defineComponent({
      name,
      setup(_, { attrs, slots }) {
        return () => h('div', attrs, slots.default?.());
      },
    });
  const Form = Object.assign(passthrough('MockForm'), {
    Item: passthrough('MockFormItem'),
  });
  const Input = Object.assign(passthrough('MockInput'), {
    TextArea: passthrough('MockTextArea'),
  });

  return {
    Button: passthrough('MockButton'),
    Form,
    Input,
    InputNumber: passthrough('MockInputNumber'),
    message: { error: mockMessageError },
    Modal: defineComponent({
      name: 'MockModal',
      emits: ['ok', 'update:open'],
      setup(_, { emit, slots }) {
        return () =>
          h('div', [
            slots.default?.(),
            h(
              'button',
              {
                'data-testid': 'close-submit',
                onClick: () => emit('ok'),
              },
              'Submit',
            ),
          ]);
      },
    }),
    Select: defineComponent({
      name: 'MockSelect',
      inheritAttrs: false,
      props: {
        disabled: Boolean,
        options: { default: () => [], type: Array },
        value: String,
      },
      emits: ['change'],
      setup(props, { attrs, emit }) {
        return () =>
          h(
            'select',
            {
              ...attrs,
              disabled: props.disabled,
              value: props.value,
              onChange: (event: Event) =>
                emit('change', (event.target as HTMLSelectElement).value),
            },
            (props.options as Array<{ label: string; value: string }>).map(
              (option) => h('option', { value: option.value }, option.label),
            ),
          );
      },
    }),
    Switch: passthrough('MockSwitch'),
    Upload: passthrough('MockUpload'),
  };
});

vi.mock('@vben/icons', () => ({
  IconifyIcon: defineComponent({
    name: 'MockIcon',
    setup() {
      return () => h('span');
    },
  }),
}));

vi.mock('#/api/qms/inspection-request', () => ({
  getPublicInspectionRequestResponsibilityOptions: mockGetResponsibilityOptions,
}));

vi.mock('#/api/qms/work-order', () => ({
  getWorkOrderListPage: vi.fn().mockResolvedValue({ items: [] }),
}));

vi.mock('#/composables/useImageCompress', () => ({
  useImageCompress: () => ({
    compressImage: vi.fn(),
    isImage: vi.fn().mockReturnValue(false),
  }),
}));

vi.mock('#/hooks/useAdaptivePopup', () => ({
  useAdaptivePopup: () => ({
    isMobile: false,
    modalWidth: 320,
    modalWrapClassName: '',
  }),
}));

vi.mock('../../issues/constants', () => ({
  useStatusOptions: () => ({ statusOptions: [] }),
}));

vi.mock('../../issues/components/IssueFormFields.vue', () => ({
  default: defineComponent({
    name: 'MockIssueFormFields',
    setup(_, { expose }) {
      expose({
        getValues: vi.fn().mockResolvedValue({}),
        setValues: mockSetValues,
        validate: vi.fn().mockResolvedValue({ valid: true }),
      });
      return () => h('div');
    },
  }),
}));

type CloseModalTestProps = {
  closeAttachmentFileList: UploadFile[];
  closeForm: {
    attachments: InspectionRequestAttachment[];
    closeRemark: string;
    hasDocuments: boolean;
    inspectionId: string;
    inspector: string;
    quantity: number;
    result: 'FAIL' | 'PASS';
  };
  currentRequest?: InspectionRequest;
  deptTreeData: [];
  displayCloseReadonlyValue: (value?: null | string) => string;
  handleCloseAttachmentUploadChange: () => void;
  linkedIssueDraft: {
    claim: string;
    defectCategoryId: string;
    defectSubcategoryId: string;
    description: string;
    division: string;
    divisionId: string;
    generateNcNumber: boolean;
    lossAmount: number;
    ncNumber: string;
    partName: string;
    photos: UploadFile[];
    processName: string;
    qualifiedQuantity: number;
    reportDate: string;
    reportedBy: string;
    responsibilityType: InspectionIssueResponsibilityType;
    responsibleDepartment: string;
    responsibleDepartmentId: string;
    responsibleWelder: string;
    rootCause: string;
    severity: string;
    solution: string;
    status: string;
    supplierId: string;
    supplierName: string;
    unqualifiedQuantity: number;
  };
  open: boolean;
  submitting: boolean;
  uploadHeaders: Record<string, string>;
};

function createRequest(
  overrides: Partial<InspectionRequest> = {},
): InspectionRequest {
  return {
    createdAt: '2026-08-14T00:00:00.000Z',
    id: 'request-legacy',
    mutualCheckResult: 'NA',
    partName: 'Bearing',
    priority: 3,
    processName: 'Machining',
    quantity: 1,
    reporter: 'Reporter A',
    requestNo: 'IR-001',
    selfCheckResult: 'NA',
    status: 'INSPECTING',
    submittedAt: '2026-08-14T00:00:00.000Z',
    updatedAt: '2026-08-14T00:00:00.000Z',
    workOrderNumber: 'WO-001',
    ...overrides,
  };
}

function createProps(
  overrides: Partial<CloseModalTestProps> = {},
): CloseModalTestProps {
  return {
    closeAttachmentFileList: [],
    closeForm: {
      attachments: [] as InspectionRequestAttachment[],
      closeRemark: '',
      hasDocuments: true,
      inspectionId: '',
      inspector: 'Inspector A',
      quantity: 1,
      result: 'PASS' as const,
    },
    currentRequest: createRequest({
      id: 'request-legacy',
      responsibilityType: null,
      responsibleDepartmentId: null,
      supplierId: null,
    }),
    deptTreeData: [],
    displayCloseReadonlyValue: (value?: null | string) => value || '-',
    handleCloseAttachmentUploadChange: vi.fn(),
    linkedIssueDraft: {
      claim: 'No',
      defectCategoryId: '',
      defectSubcategoryId: '',
      description: '',
      division: '',
      divisionId: '',
      generateNcNumber: false,
      lossAmount: 0,
      ncNumber: '',
      partName: '',
      photos: [] as UploadFile[],
      processName: '',
      qualifiedQuantity: 1,
      reportDate: '2026-08-14',
      reportedBy: 'Inspector A',
      responsibilityType: 'INTERNAL_DEPARTMENT',
      responsibleDepartment: '',
      responsibleDepartmentId: '',
      responsibleWelder: '',
      rootCause: '',
      severity: 'MEDIUM',
      solution: '',
      status: 'OPEN',
      supplierId: '',
      supplierName: '',
      unqualifiedQuantity: 0,
    },
    open: true,
    submitting: false,
    uploadHeaders: {},
    ...overrides,
  };
}

describe('close inspection request responsibility adjudication', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockGetResponsibilityOptions.mockResolvedValue({
      departments: [{ label: 'Assembly Department', value: 'dept-assembly' }],
      responsibilityType: 'INTERNAL_DEPARTMENT',
      suppliers: [],
    });
  });

  it('shows and submits adjudication controls for a legacy pass request', async () => {
    const wrapper = mount(CloseInspectionModal, {
      props: createProps(),
    });
    await flushPromises();

    expect(mockGetResponsibilityOptions).toHaveBeenCalledWith({
      responsibilityType: 'INTERNAL_DEPARTMENT',
    });
    expect(
      wrapper.find('[data-testid="close-responsibility-type"]').exists(),
    ).toBe(true);
    await wrapper
      .find('[data-testid="close-responsibility-department"]')
      .setValue('dept-assembly');
    await wrapper.find('[data-testid="close-submit"]').trigger('click');

    expect(wrapper.emitted('update:linkedIssueDraft')?.at(-1)).toEqual([
      expect.objectContaining({
        responsibleDepartment: 'Assembly Department',
        responsibleDepartmentId: 'dept-assembly',
      }),
    ]);
    expect(wrapper.emitted('submit')).toHaveLength(1);
  });

  it('limits partial PROCESS requests to internal and outsourcing responsibility types', async () => {
    const wrapper = mount(CloseInspectionModal, {
      props: createProps({
        currentRequest: createRequest({
          category: 'PROCESS',
          id: 'request-partial',
          responsibilityType: 'OUTSOURCING_UNIT',
          responsibleDepartmentId: null,
          supplierId: null,
        }),
        linkedIssueDraft: {
          ...createProps().linkedIssueDraft,
          responsibilityType: 'OUTSOURCING_UNIT',
          supplierId: '',
        },
      }),
    });
    await flushPromises();

    expect(
      wrapper
        .find('[data-testid="close-responsibility-type"]')
        .findAll('option')
        .map((option) => option.attributes('value')),
    ).toEqual(['INTERNAL_DEPARTMENT', 'OUTSOURCING_UNIT']);
  });

  it('limits partial INCOMING requests to external responsibility types and hides the department', async () => {
    mockGetResponsibilityOptions.mockResolvedValueOnce({
      departments: [],
      responsibilityType: 'SUPPLIER',
      suppliers: [{ label: 'Supplier A', value: 'supplier-a' }],
    });
    const wrapper = mount(CloseInspectionModal, {
      props: createProps({
        currentRequest: createRequest({
          category: 'INCOMING',
          id: 'request-incoming-partial',
          responsibilityType: 'SUPPLIER',
          responsibleDepartmentId: null,
          supplierId: null,
        }),
        linkedIssueDraft: {
          ...createProps().linkedIssueDraft,
          responsibilityType: 'SUPPLIER',
        },
      }),
    });
    await flushPromises();

    expect(
      wrapper
        .find('[data-testid="close-responsibility-type"]')
        .findAll('option')
        .map((option) => option.attributes('value')),
    ).toEqual(['SUPPLIER', 'OUTSOURCING_UNIT']);
    expect(
      wrapper.find('[data-testid="close-responsibility-department"]').exists(),
    ).toBe(false);
    expect(
      wrapper.find('[data-testid="close-responsibility-supplier"]').exists(),
    ).toBe(true);
  });

  it.each(['INCOMING', 'PROCESS'] as const)(
    'does not show a responsibility department for partial %s outsourcing',
    async (category) => {
      const wrapper = mount(CloseInspectionModal, {
        props: createProps({
          currentRequest: createRequest({
            category,
            id: `request-${category.toLowerCase()}-outsourcing`,
            responsibilityType: 'OUTSOURCING_UNIT',
            responsibleDepartmentId: null,
            supplierId: null,
          }),
          linkedIssueDraft: {
            ...createProps().linkedIssueDraft,
            responsibilityType: 'OUTSOURCING_UNIT',
          },
        }),
      });
      await flushPromises();

      expect(
        wrapper
          .find('[data-testid="close-responsibility-department"]')
          .exists(),
      ).toBe(false);
      expect(
        wrapper.find('[data-testid="close-responsibility-supplier"]').exists(),
      ).toBe(true);
    },
  );

  it.each(['INCOMING', 'PROCESS'] as const)(
    'keeps %s outsourcing with a missing persisted department editable',
    async (category) => {
      mockGetResponsibilityOptions.mockResolvedValueOnce({
        departments: [],
        responsibilityType: 'OUTSOURCING_UNIT',
        suppliers: [{ label: 'External Plant', value: 'supplier-external' }],
      });
      const wrapper = mount(CloseInspectionModal, {
        props: createProps({
          currentRequest: createRequest({
            category,
            id: `request-${category.toLowerCase()}-supplier-only`,
            responsibilityType: 'OUTSOURCING_UNIT',
            responsibleDepartmentId: null,
            supplierId: 'supplier-external',
          }),
          linkedIssueDraft: {
            ...createProps().linkedIssueDraft,
            responsibilityType: 'OUTSOURCING_UNIT',
            supplierId: 'supplier-external',
            supplierName: 'External Plant',
          },
        }),
      });
      await flushPromises();

      expect(
        wrapper.find('[data-testid="close-responsibility-type"]').exists(),
      ).toBe(true);
      expect(
        wrapper
          .find('[data-testid="close-responsibility-department"]')
          .exists(),
      ).toBe(false);
      expect(mockGetResponsibilityOptions).toHaveBeenCalledWith({
        responsibilityType: 'OUTSOURCING_UNIT',
      });
    },
  );

  it('keeps a complete persisted responsibility locked and does not load choices', async () => {
    const wrapper = mount(CloseInspectionModal, {
      props: createProps({
        currentRequest: createRequest({
          category: 'INCOMING',
          id: 'request-complete',
          responsibilityType: 'SUPPLIER',
          responsibleDepartmentId: 'dept-purchase',
          supplierId: 'supplier-1',
        }),
      }),
    });
    await flushPromises();

    expect(
      wrapper.find('[data-testid="close-responsibility-type"]').exists(),
    ).toBe(false);
    expect(mockGetResponsibilityOptions).not.toHaveBeenCalled();
  });

  it('adjudicates an internal responsibility with a stale supplier ID', async () => {
    const wrapper = mount(CloseInspectionModal, {
      props: createProps({
        currentRequest: createRequest({
          category: 'PROCESS',
          id: 'request-stale-supplier',
          responsibilityType: 'INTERNAL_DEPARTMENT',
          responsibleDepartmentId: 'dept-assembly',
          supplierId: 'supplier-stale',
        }),
        linkedIssueDraft: {
          ...createProps().linkedIssueDraft,
          responsibleDepartment: 'Assembly Department',
          responsibleDepartmentId: 'dept-assembly',
          supplierId: 'supplier-stale',
          supplierName: 'Stale Supplier',
        },
      }),
    });
    await flushPromises();

    expect(
      wrapper.find('[data-testid="close-responsibility-type"]').exists(),
    ).toBe(true);
    expect(mockGetResponsibilityOptions).toHaveBeenCalledWith({
      responsibilityType: 'INTERNAL_DEPARTMENT',
    });
    await wrapper.find('[data-testid="close-submit"]').trigger('click');

    expect(wrapper.emitted('update:linkedIssueDraft')?.at(-1)).toEqual([
      expect.objectContaining({
        responsibleDepartmentId: 'dept-assembly',
        supplierId: '',
        supplierName: '',
      }),
    ]);
    expect(wrapper.emitted('submit')).toHaveLength(1);
  });

  it('blocks submission after responsibility option loading fails', async () => {
    mockGetResponsibilityOptions.mockRejectedValueOnce(
      new Error('Network unavailable'),
    );
    const wrapper = mount(CloseInspectionModal, {
      props: createProps(),
    });
    await flushPromises();

    await wrapper.find('[data-testid="close-submit"]').trigger('click');

    expect(mockMessageError).toHaveBeenCalledWith(
      '责任归属选项加载失败，无法提交',
    );
    expect(wrapper.emitted('submit')).toBeUndefined();
  });
});
