import { mount } from '@vue/test-utils';
import { defineComponent, h, nextTick } from 'vue';

import { describe, expect, it, vi } from 'vitest';

import SupervisionProjectFormDrawer from './SupervisionProjectFormDrawer.vue';

vi.mock('#/api/qms/work-order', () => ({
  getWorkOrderList: vi.fn().mockResolvedValue({ items: [] }),
}));
vi.mock('#/hooks/useMobileViewport', () => ({
  useMobileViewport: () => ({ isMobile: false }),
}));

const SupplierSelectStub = defineComponent({
  name: 'SupplierSelect',
  props: {
    legacyName: String,
    value: String,
    valueMode: String,
  },
  emits: ['change', 'update:value'],
  setup() {
    return () => h('div');
  },
});

const SlotStub = defineComponent({
  setup(_, { slots }) {
    return () => h('div', [slots.default?.(), slots.footer?.()]);
  },
});

describe('supervision project supplier identity', () => {
  it('emits the supplier ID with its name snapshot', async () => {
    const wrapper = mount(SupervisionProjectFormDrawer, {
      props: {
        editingProjectId: 'project-1',
        form: {
          projectName: 'Project A',
          supervisor: '',
          supplierId: 'supplier-old',
          supplierName: 'Legacy Supplier',
          workOrderNumber: '',
        },
        open: true,
        userOptions: [],
      },
      global: {
        stubs: {
          Button: SlotStub,
          DatePicker: true,
          Drawer: SlotStub,
          Form: SlotStub,
          FormItem: SlotStub,
          Input: true,
          Select: true,
          Space: SlotStub,
          SupplierSelect: SupplierSelectStub,
          WorkOrderSelect: true,
        },
      },
    });

    const select = wrapper.findComponent(SupplierSelectStub);
    expect(select.props()).toMatchObject({
      legacyName: 'Legacy Supplier',
      value: 'supplier-old',
      valueMode: 'id',
    });

    await select.vm.$emit('change', 'supplier-1', {
      item: { name: 'Supplier A' },
    });
    await nextTick();

    expect(wrapper.emitted('update:form')?.at(-1)?.[0]).toMatchObject({
      supplierId: 'supplier-1',
      supplierName: 'Supplier A',
    });
  });
});
