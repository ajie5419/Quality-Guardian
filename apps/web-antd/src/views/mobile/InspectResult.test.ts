import { flushPromises, mount } from '@vue/test-utils';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import InspectResult from './InspectResult.vue';

const {
  classificationOptionsMock,
  closeInspectionRequestMock,
  getInspectionRequestMock,
  optionsMock,
} = vi.hoisted(() => ({
  classificationOptionsMock: vi.fn(),
  closeInspectionRequestMock: vi.fn(),
  getInspectionRequestMock: vi.fn(),
  optionsMock: vi.fn(),
}));

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { id: 'request-1' } }),
  useRouter: () => ({ replace: vi.fn() }),
}));

vi.mock('@vben/stores', () => ({
  useAccessStore: () => ({ accessToken: 'token' }),
}));

vi.mock('#/api/qms/inspection-request', () => ({
  closeInspectionRequest: closeInspectionRequestMock,
  getInspectionRequest: getInspectionRequestMock,
  getPublicInspectionRequestResponsibilityOptions: optionsMock,
}));

vi.mock('#/views/qms/shared/utils/upload-file', () => ({
  applyUploadResponse: () => false,
  normalizeUploadFileList: (files: Array<{ name: string; url: string }>) =>
    files,
}));

vi.mock('#/api/qms/quality-classification', () => ({
  getQualityClassificationOptionsApi: classificationOptionsMock,
}));

vi.mock('ant-design-vue', () => ({
  Button: {
    emits: ['click'],
    template: '<button @click="$emit(\'click\')"><slot /></button>',
  },
  Descriptions: { template: '<div><slot /></div>' },
  DescriptionsItem: { template: '<div><slot /></div>' },
  Form: { template: '<form><slot /></form>' },
  FormItem: {
    props: ['label'],
    template: '<label>{{ label }}<slot /></label>',
  },
  InputNumber: { template: '<input type="number" />' },
  message: { error: vi.fn(), success: vi.fn(), warning: vi.fn() },
  Segmented: {
    props: ['options', 'value'],
    emits: ['update:value'],
    template:
      '<select class="segmented" :value="value" @change="$emit(\'update:value\', $event.target.value)"><option v-for="option in options" :key="option.value" :value="option.value">{{ option.label }}</option></select>',
  },
  Select: {
    props: ['loading', 'options', 'value'],
    emits: ['update:value'],
    template:
      '<select :value="value" @change="$emit(\'update:value\', $event.target.value)"><option v-for="option in options" :key="option.value" :value="option.value">{{ option.label }}</option></select>',
  },
  Spin: { template: '<div><slot /></div>' },
  Switch: { template: '<input type="checkbox" />' },
  Textarea: {
    props: ['value'],
    emits: ['update:value'],
    template:
      '<textarea :value="value" @input="$emit(\'update:value\', $event.target.value)" />',
  },
  Upload: {
    emits: ['update:fileList'],
    template:
      "<button class=\"upload\" @click=\"$emit('update:fileList', [{ name: 'photo.jpg', url: '/uploads/photo.jpg' }])\"><slot /></button>",
  },
}));

describe('inspect result', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    classificationOptionsMock.mockResolvedValue([]);
  });

  it('sends close-time canonical responsibility for a historical PASS task', async () => {
    getInspectionRequestMock.mockResolvedValue({
      category: 'PROCESS',
      id: 'request-1',
      quantity: 3,
      requestNo: 'IR-001',
      responsibilityType: null,
      responsibleDepartmentId: null,
      supplierId: null,
    });
    optionsMock.mockResolvedValue({
      departments: [{ label: 'Quality', value: 'dept-quality' }],
      responsibilityType: 'INTERNAL_DEPARTMENT',
      suppliers: [],
    });
    closeInspectionRequestMock.mockResolvedValue({});

    const wrapper = mount(InspectResult);
    await flushPromises();

    expect(wrapper.text()).toContain('责任归属类型');
    expect(wrapper.text()).toContain('责任部门');
    expect(wrapper.findAll('select')).toHaveLength(3);

    const selects = wrapper.findAll('select');
    const departmentSelect = selects.at(2);
    if (!departmentSelect) throw new Error('Department select not rendered');
    await departmentSelect.setValue('dept-quality');
    await wrapper.get('button.upload').trigger('click');
    const submitButton = wrapper.findAll('button').at(-1);
    if (!submitButton) throw new Error('Submit button not rendered');
    await submitButton.trigger('click');
    await flushPromises();

    expect(closeInspectionRequestMock).toHaveBeenCalledWith(
      'request-1',
      expect.objectContaining({
        attachments: [{ name: 'photo.jpg', url: '/uploads/photo.jpg' }],
        hasDocuments: true,
        qualifiedQuantity: 3,
        quantity: 3,
        responsibility: {
          responsibilityType: 'INTERNAL_DEPARTMENT',
          responsibleDepartmentId: 'dept-quality',
        },
        result: 'PASS',
        unqualifiedQuantity: 0,
      }),
    );
  });

  it('does not render an override control or send responsibility for a complete task', async () => {
    getInspectionRequestMock.mockResolvedValue({
      category: 'INCOMING',
      id: 'request-1',
      quantity: 1,
      requestNo: 'IR-001',
      responsibilityType: 'SUPPLIER',
      responsibleDepartmentId: 'dept-purchasing',
      supplierId: 'supplier-1',
    });
    closeInspectionRequestMock.mockResolvedValue({});

    const wrapper = mount(InspectResult);
    await flushPromises();

    expect(wrapper.text()).not.toContain('责任归属类型');
    await wrapper.get('button.upload').trigger('click');
    const submitButton = wrapper.findAll('button').at(-1);
    if (!submitButton) throw new Error('Submit button not rendered');
    await submitButton.trigger('click');
    await flushPromises();

    expect(optionsMock).not.toHaveBeenCalled();
    expect(closeInspectionRequestMock).toHaveBeenCalledWith(
      'request-1',
      expect.not.objectContaining({ responsibility: expect.anything() }),
    );
  });

  it.each(['INCOMING', 'PROCESS'] as const)(
    'submits historical %s outsourcing responsibility without a department',
    async (category) => {
      getInspectionRequestMock.mockResolvedValue({
        category,
        id: 'request-1',
        quantity: 1,
        requestNo: 'IR-001',
        responsibilityType: 'OUTSOURCING_UNIT',
        responsibleDepartmentId: null,
        supplierId: 'supplier-legacy',
      });
      optionsMock.mockResolvedValue({
        departments: [],
        responsibilityType: 'OUTSOURCING_UNIT',
        suppliers: [{ label: 'External Plant', value: 'supplier-external' }],
      });
      closeInspectionRequestMock.mockResolvedValue({});

      const wrapper = mount(InspectResult);
      await flushPromises();

      expect(wrapper.text()).toContain('责任归属类型');
      expect(wrapper.text()).not.toContain('责任部门');
      const supplierSelect = wrapper.findAll('select').at(2);
      if (!supplierSelect) throw new Error('Supplier select not rendered');
      await supplierSelect.setValue('supplier-external');
      await wrapper.get('button.upload').trigger('click');
      const submitButton = wrapper.findAll('button').at(-1);
      if (!submitButton) throw new Error('Submit button not rendered');
      await submitButton.trigger('click');
      await flushPromises();

      expect(closeInspectionRequestMock).toHaveBeenCalledWith(
        'request-1',
        expect.objectContaining({
          responsibility: {
            responsibilityType: 'OUTSOURCING_UNIT',
            supplierId: 'supplier-external',
          },
        }),
      );
      expect(closeInspectionRequestMock.mock.calls[0]?.[1]).not.toHaveProperty(
        'responsibility.responsibleDepartmentId',
      );
    },
  );

  it('locks a complete outsourcing task only when its persisted department exists', async () => {
    getInspectionRequestMock.mockResolvedValue({
      category: 'PROCESS',
      id: 'request-1',
      quantity: 1,
      requestNo: 'IR-001',
      responsibilityType: 'OUTSOURCING_UNIT',
      responsibleDepartmentId: 'dept-production',
      supplierId: 'supplier-external',
    });
    closeInspectionRequestMock.mockResolvedValue({});

    const wrapper = mount(InspectResult);
    await flushPromises();

    expect(wrapper.text()).not.toContain('责任归属类型');
    expect(wrapper.text()).not.toContain('责任部门');
    await wrapper.get('button.upload').trigger('click');
    const submitButton = wrapper.findAll('button').at(-1);
    if (!submitButton) throw new Error('Submit button not rendered');
    await submitButton.trigger('click');
    await flushPromises();

    expect(optionsMock).not.toHaveBeenCalled();
    expect(closeInspectionRequestMock).toHaveBeenCalledWith(
      'request-1',
      expect.not.objectContaining({ responsibility: expect.anything() }),
    );
  });

  it('does not call the close API for a PASS result without an inspection record', async () => {
    getInspectionRequestMock.mockResolvedValue({
      category: 'PROCESS',
      id: 'request-1',
      quantity: 1,
      requestNo: 'IR-001',
      responsibilityType: 'INTERNAL_DEPARTMENT',
      responsibleDepartmentId: 'dept-quality',
      supplierId: null,
    });

    const wrapper = mount(InspectResult);
    await flushPromises();

    const submitButton = wrapper.findAll('button').at(-1);
    if (!submitButton) throw new Error('Submit button not rendered');
    await submitButton.trigger('click');
    await flushPromises();

    expect(closeInspectionRequestMock).not.toHaveBeenCalled();
  });

  it('sends a complete linked issue when the result is FAIL', async () => {
    getInspectionRequestMock.mockResolvedValue({
      category: 'PROCESS',
      id: 'request-1',
      partName: 'Frame',
      processName: 'Welding',
      quantity: 3,
      requestNo: 'IR-001',
      responsibilityType: null,
      responsibleDepartmentId: null,
      supplierId: null,
    });
    optionsMock.mockResolvedValue({
      departments: [{ label: 'Quality', value: 'dept-quality' }],
      responsibilityType: 'INTERNAL_DEPARTMENT',
      suppliers: [],
    });
    classificationOptionsMock.mockResolvedValue([
      {
        id: 'category-1',
        name: 'Surface',
        subcategories: [{ id: 'subcategory-1', name: 'Scratch' }],
      },
    ]);
    closeInspectionRequestMock.mockResolvedValue({});

    const wrapper = mount(InspectResult);
    await flushPromises();

    await wrapper.get('select.segmented').setValue('FAIL');
    await flushPromises();
    const selects = wrapper.findAll('select');
    const departmentSelect = selects.at(2);
    const categorySelect = selects.at(3);
    const subcategorySelect = selects.at(4);
    if (!departmentSelect || !categorySelect || !subcategorySelect) {
      throw new Error('FAIL controls not rendered');
    }
    await departmentSelect.setValue('dept-quality');
    await categorySelect.setValue('category-1');
    await subcategorySelect.setValue('subcategory-1');
    const textareas = wrapper.findAll('textarea');
    const description = textareas.at(1);
    const rootCause = textareas.at(2);
    const solution = textareas.at(3);
    if (!description || !rootCause || !solution) {
      throw new Error('FAIL text controls not rendered');
    }
    await description.setValue('Surface scratch');
    await rootCause.setValue('Fixture shifted');
    await solution.setValue('Adjust fixture');
    await wrapper.get('button.upload').trigger('click');
    const submitButton = wrapper.findAll('button').at(-1);
    if (!submitButton) throw new Error('Submit button not rendered');
    await submitButton.trigger('click');
    await flushPromises();

    expect(closeInspectionRequestMock).toHaveBeenCalledWith(
      'request-1',
      expect.objectContaining({
        linkedIssue: {
          defectCategoryId: 'category-1',
          defectSubcategoryId: 'subcategory-1',
          description: 'Surface scratch',
          generateNcNumber: false,
          lossAmount: 0,
          partName: 'Frame',
          photos: ['/uploads/photo.jpg'],
          processName: 'Welding',
          quantity: 3,
          responsibilityType: 'INTERNAL_DEPARTMENT',
          responsibleDepartmentId: 'dept-quality',
          rootCause: 'Fixture shifted',
          severity: 'Minor',
          solution: 'Adjust fixture',
          status: 'OPEN',
        },
        responsibility: {
          responsibilityType: 'INTERNAL_DEPARTMENT',
          responsibleDepartmentId: 'dept-quality',
        },
        result: 'FAIL',
        unqualifiedQuantity: 3,
      }),
    );
  });

  it('keeps top-level and linked-issue outsourcing responsibility department-free', async () => {
    getInspectionRequestMock.mockResolvedValue({
      category: 'PROCESS',
      id: 'request-1',
      partName: 'Frame',
      processName: 'Welding',
      quantity: 3,
      requestNo: 'IR-001',
      responsibilityType: 'OUTSOURCING_UNIT',
      responsibleDepartmentId: null,
      supplierId: null,
    });
    optionsMock.mockResolvedValue({
      departments: [],
      responsibilityType: 'OUTSOURCING_UNIT',
      suppliers: [{ label: 'External Plant', value: 'supplier-external' }],
    });
    classificationOptionsMock.mockResolvedValue([
      {
        id: 'category-1',
        name: 'Surface',
        subcategories: [{ id: 'subcategory-1', name: 'Scratch' }],
      },
    ]);
    closeInspectionRequestMock.mockResolvedValue({});

    const wrapper = mount(InspectResult);
    await flushPromises();

    expect(wrapper.text()).not.toContain('责任部门');
    await wrapper.get('select.segmented').setValue('FAIL');
    await flushPromises();
    const selects = wrapper.findAll('select');
    const supplierSelect = selects.at(2);
    const categorySelect = selects.at(3);
    const subcategorySelect = selects.at(4);
    if (!supplierSelect || !categorySelect || !subcategorySelect) {
      throw new Error('Outsourcing FAIL controls not rendered');
    }
    await supplierSelect.setValue('supplier-external');
    await categorySelect.setValue('category-1');
    await subcategorySelect.setValue('subcategory-1');
    const textareas = wrapper.findAll('textarea');
    const description = textareas.at(1);
    const rootCause = textareas.at(2);
    const solution = textareas.at(3);
    if (!description || !rootCause || !solution) {
      throw new Error('Outsourcing FAIL text controls not rendered');
    }
    await description.setValue('Surface scratch');
    await rootCause.setValue('Fixture shifted');
    await solution.setValue('Adjust fixture');
    await wrapper.get('button.upload').trigger('click');
    const submitButton = wrapper.findAll('button').at(-1);
    if (!submitButton) throw new Error('Submit button not rendered');
    await submitButton.trigger('click');
    await flushPromises();

    expect(closeInspectionRequestMock).toHaveBeenCalledWith(
      'request-1',
      expect.objectContaining({
        linkedIssue: expect.objectContaining({
          responsibilityType: 'OUTSOURCING_UNIT',
          supplierId: 'supplier-external',
        }),
        responsibility: {
          responsibilityType: 'OUTSOURCING_UNIT',
          supplierId: 'supplier-external',
        },
      }),
    );
    const payload = closeInspectionRequestMock.mock.calls[0]?.[1];
    expect(payload?.responsibility).not.toHaveProperty(
      'responsibleDepartmentId',
    );
    expect(payload?.linkedIssue).not.toHaveProperty('responsibleDepartmentId');
  });
});
