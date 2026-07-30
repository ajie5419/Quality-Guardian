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
      partSearchLoading: false,
      processOptions: [],
      requiresComponentName: false,
      requiresStationSelection: false,
      stationQuantity: 0,
      submitting: false,
      teamLoading: false,
      teamOptions: [],
      uploadAction: '/upload',
      workOrderLoading: false,
      workOrderOptions: [],
      workOrderProcessesLoading: false,
    },
  });
  return { form, wrapper };
}

describe('inspection request entry responsible unit identity', () => {
  it('writes supplier ID and name snapshot for incoming inspection', async () => {
    const { form, wrapper } = mountFields(true);
    const select = wrapper
      .findAllComponents({ name: 'MockSelect' })
      .find(
        (item) => item.attributes('data-testid') === 'responsible-unit-select',
      );

    expect(select).toBeDefined();
    select?.vm.$emit('change', 'supplier-1', { label: 'Supplier A' });
    await wrapper.vm.$nextTick();

    expect(form).toMatchObject({
      supplierId: 'supplier-1',
      team: 'Supplier A',
      teamId: '',
    });
  });

  it('writes TEAM ID and name snapshot for process inspection', async () => {
    const { form, wrapper } = mountFields(false);
    const select = wrapper
      .findAllComponents({ name: 'MockSelect' })
      .find(
        (item) => item.attributes('data-testid') === 'responsible-unit-select',
      );

    expect(select).toBeDefined();
    select?.vm.$emit('change', 'team-1', { label: 'Assembly Team' });
    await wrapper.vm.$nextTick();

    expect(form).toMatchObject({
      supplierId: '',
      team: 'Assembly Team',
      teamId: 'team-1',
    });
  });
});

describe('inspection request entry material identity', () => {
  it('allows incoming inspection to request a material without a canonical ID', async () => {
    const { form, wrapper } = mountFields(true);
    const button = wrapper
      .findAll('button')
      .find((item) => item.text() === 'Request new material');

    expect(button).toBeDefined();
    await button?.trigger('click');

    expect(form).toMatchObject({
      partId: '',
      partName: '',
      requestNewPart: true,
    });
    expect(wrapper.text()).toContain('Select existing material');
  });
});
