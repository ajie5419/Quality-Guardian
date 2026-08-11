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
    team: 'Legacy Unit',
    teamId: 'team-old',
    workOrderNumber: '',
    workOrderNumbers: [],
  };
}

function mountFields(isIncomingEntry: boolean) {
  const form = createForm();
  if (isIncomingEntry) form.responsibilityType = 'SUPPLIER';
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
        teamLabel: 'Responsible unit',
        teamPlaceholder: 'Select unit',
      },
      form,
      isIncomingEntry,
      internalTeamOptions: [
        {
          group: 'internal',
          label: 'Assembly Team',
          responsibleDepartmentId: 'dept-assembly',
          value: 'team-assembly',
        },
      ],
      partSearchLoading: false,
      processOptions: [],
      responsibilityDepartmentOptions: [
        { label: 'Assembly Department', value: 'dept-assembly' },
      ],
      responsibilityLoading: false,
      responsibilityTypeOptions: [
        { label: 'Internal department', value: 'INTERNAL_DEPARTMENT' },
        { label: 'Supplier', value: 'SUPPLIER' },
        { label: 'Outsourcing', value: 'OUTSOURCING_UNIT' },
      ],
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
  it('writes a supplier canonical ID and clears stale TEAM identity', async () => {
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
      team: '',
      teamId: '',
    });
  });

  it('writes TEAM and canonical department IDs for internal process responsibility', async () => {
    const { form, wrapper } = mountFields(false);
    const select = wrapper
      .findAllComponents({ name: 'MockSelect' })
      .find(
        (item) => item.attributes('data-testid') === 'responsible-team-select',
      );

    expect(select).toBeDefined();
    select?.vm.$emit('change', 'team-assembly');
    await wrapper.vm.$nextTick();

    expect(form).toMatchObject({
      responsibleDepartmentId: 'dept-assembly',
      teamId: 'team-assembly',
    });
  });
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
          teamLabel: 'Responsible unit',
          teamPlaceholder: 'Select unit',
        },
        form,
        isIncomingEntry: true,
        internalTeamOptions: [],
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
