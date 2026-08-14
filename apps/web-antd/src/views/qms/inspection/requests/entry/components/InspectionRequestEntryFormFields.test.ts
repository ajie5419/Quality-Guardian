// @vitest-environment happy-dom

import { mount } from '@vue/test-utils';

import { describe, expect, it, vi } from 'vitest';

import InspectionRequestEntryFormFields from './InspectionRequestEntryFormFields.vue';

vi.mock('ant-design-vue', async () => {
  const { defineComponent, h } = await import('vue');
  const SlotComponent = defineComponent({
    setup(_, { slots }) {
      return () => h('div', slots.default?.());
    },
  });
  const InputComponent = Object.assign(
    defineComponent({
      setup() {
        return () => h('input');
      },
    }),
    { TextArea: SlotComponent },
  );
  return {
    Button: defineComponent({
      inheritAttrs: false,
      setup(_, { attrs, slots }) {
        return () => h('button', attrs, slots.default?.());
      },
    }),
    Form: Object.assign(SlotComponent, { Item: SlotComponent }),
    Input: InputComponent,
    InputNumber: InputComponent,
    Select: defineComponent({
      name: 'MockSelect',
      inheritAttrs: false,
      emits: ['change', 'search', 'update:value'],
      props: ['options'],
      setup(_, { attrs }) {
        return () => h('div', attrs);
      },
    }),
  };
});

vi.mock('./InspectionRequestEntryUploadActions.vue', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    default: defineComponent({
      setup(_, { slots }) {
        return () => h('div', slots.default?.());
      },
    }),
  };
});

function createForm() {
  return {
    componentName: '',
    incomingType: '',
    mutualCheckResult: 'PASS' as const,
    partId: '',
    partName: '',
    processId: '',
    processName: '',
    quantity: 1,
    reporter: '',
    responsibilityType: 'INTERNAL_DEPARTMENT' as
      | 'INTERNAL_DEPARTMENT'
      | 'OUTSOURCING_UNIT'
      | 'SUPPLIER',
    responsibleDepartmentId: '',
    requestedPartName: '',
    requestNewPart: false,
    requestInfo: '',
    selfCheckResult: 'PASS' as const,
    stationSelection: null,
    supplierId: 'supplier-old',
    workOrderNumber: '',
    workOrderNumbers: [],
  };
}

function mountFields(
  isIncomingEntry: boolean,
  responsibilityType?: 'INTERNAL_DEPARTMENT' | 'OUTSOURCING_UNIT' | 'SUPPLIER',
) {
  const form = createForm();
  form.responsibilityType =
    responsibilityType ||
    (isIncomingEntry ? 'SUPPLIER' : 'INTERNAL_DEPARTMENT');
  const wrapper = mount(InspectionRequestEntryFormFields, {
    props: {
      attachmentFileList: [],
      beforeUpload: async (file: File) => file,
      bomPartOptions: [],
      bomPartsLoading: false,
      checkResultOptions: [],
      entryCopy: {
        attachmentLabel: 'Attachment',
        componentLabel: 'Component',
        partLabel: 'Part',
        partPlaceholder: 'Select part',
        processLabel: 'Process',
      },
      form,
      isIncomingEntry,
      partSearchLoading: false,
      processOptions: [],
      responsibilityDepartmentOptions: [
        { label: 'Assembly Department', value: 'dept-assembly' },
        { label: 'Structure BU', value: 'dept-structure' },
      ],
      responsibilityLoading: false,
      responsibilityTypeOptions: [
        {
          label: 'Internal department',
          value: 'INTERNAL_DEPARTMENT' as const,
        },
        { label: 'Supplier', value: 'SUPPLIER' as const },
        { label: 'Outsourcing', value: 'OUTSOURCING_UNIT' as const },
      ].filter(
        (option) => !isIncomingEntry || option.value !== 'INTERNAL_DEPARTMENT',
      ),
      requiresComponentName: false,
      requiresStationSelection: false,
      stationQuantity: 0,
      submitting: false,
      supplierOptions: [{ label: 'Supplier A', value: 'supplier-1' }],
      uploadAction: '/upload',
      workOrderLoading: false,
      workOrderOptions: [],
      workOrderProcessesLoading: false,
    },
  });
  return { form, wrapper };
}

describe('inspection request entry responsibility identity', () => {
  it('shows only external responsibility types and hides the department for incoming entry', async () => {
    const { wrapper } = mountFields(true);
    const typeSelect = wrapper
      .findAllComponents({ name: 'MockSelect' })
      .find(
        (item) =>
          item.attributes('data-testid') === 'responsibility-type-select',
      );
    const departmentSelect = wrapper
      .findAllComponents({ name: 'MockSelect' })
      .find(
        (item) =>
          item.attributes('data-testid') === 'responsible-department-select',
      );

    expect(typeSelect?.props('options')).toEqual([
      { label: 'Supplier', value: 'SUPPLIER' },
      { label: 'Outsourcing', value: 'OUTSOURCING_UNIT' },
    ]);
    expect(departmentSelect).toBeUndefined();

    typeSelect?.vm.$emit('change', 'OUTSOURCING_UNIT');
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted('responsibilityTypeChange')).toEqual([
      ['OUTSOURCING_UNIT'],
    ]);
  });

  it('writes a supplier canonical ID without a TEAM field', async () => {
    const { form, wrapper } = mountFields(true);
    const select = wrapper
      .findAllComponents({ name: 'MockSelect' })
      .find(
        (item) =>
          item.attributes('data-testid') === 'responsible-supplier-select',
      );

    expect(select).toBeDefined();
    select?.vm.$emit('change', 'supplier-1');
    await wrapper.vm.$nextTick();

    expect(form).toMatchObject({
      supplierId: 'supplier-1',
    });
  });

  it('keeps a department selectable without an execution TEAM control', async () => {
    const { form, wrapper } = mountFields(false);
    const departmentSelect = wrapper
      .findAllComponents({ name: 'MockSelect' })
      .find(
        (item) =>
          item.attributes('data-testid') === 'responsible-department-select',
      );

    expect(departmentSelect).toBeDefined();
    departmentSelect?.vm.$emit('change', 'dept-structure');
    await wrapper.vm.$nextTick();

    expect(form).toMatchObject({
      responsibleDepartmentId: 'dept-structure',
    });
    expect(
      wrapper
        .findAllComponents({ name: 'MockSelect' })
        .some(
          (item) => item.attributes('data-testid') === 'execution-team-select',
        ),
    ).toBe(false);
  });

  it.each([false, true])(
    'hides the client responsibility department for outsourcing in %s entry',
    (isIncomingEntry) => {
      const { wrapper } = mountFields(isIncomingEntry, 'OUTSOURCING_UNIT');

      expect(
        wrapper
          .findAllComponents({ name: 'MockSelect' })
          .some(
            (item) =>
              item.attributes('data-testid') ===
              'responsible-department-select',
          ),
      ).toBe(false);
      expect(
        wrapper
          .findAllComponents({ name: 'MockSelect' })
          .some(
            (item) =>
              item.attributes('data-testid') === 'responsible-supplier-select',
          ),
      ).toBe(true);
    },
  );
});

describe('inspection request entry material identity', () => {
  it('does not expose a material input mode control', () => {
    const { form, wrapper } = mountFields(true);
    expect(form.requestNewPart).toBe(false);
    expect(wrapper.text()).not.toContain('自由输入');
    expect(wrapper.text()).not.toContain('规范物料');
  });
});

describe('inspection request entry incoming type options', () => {
  it('derives incoming type options from the settings-driven process options', () => {
    const form = createForm();
    const wrapper = mount(InspectionRequestEntryFormFields, {
      props: {
        attachmentFileList: [],
        beforeUpload: async (file: File) => file,
        bomPartOptions: [],
        bomPartsLoading: false,
        checkResultOptions: [],
        entryCopy: {
          attachmentLabel: 'Attachment',
          componentLabel: 'Component',
          partLabel: 'Part',
          partPlaceholder: 'Select part',
          processLabel: 'Process',
        },
        form,
        isIncomingEntry: true,
        partSearchLoading: false,
        processOptions: [
          { label: '原材料', processName: '原材料', value: 'proc-raw' },
          { label: '外购件', processName: '外购件', value: 'proc-out' },
        ],
        responsibilityDepartmentOptions: [],
        responsibilityLoading: false,
        responsibilityTypeOptions: [
          { label: 'Internal department', value: 'INTERNAL_DEPARTMENT' },
        ],
        requiresComponentName: false,
        requiresStationSelection: false,
        stationQuantity: 0,
        submitting: false,
        supplierOptions: [],
        uploadAction: '/upload',
        workOrderLoading: false,
        workOrderOptions: [],
        workOrderProcessesLoading: false,
      },
    });
    const select = wrapper
      .findAllComponents({ name: 'MockSelect' })
      .find((item) => item.attributes('placeholder') === '请选择进货类型');

    expect(select?.props('options')).toEqual([
      { label: '原材料', value: 'proc-raw' },
      { label: '外购件', value: 'proc-out' },
    ]);
  });
});
