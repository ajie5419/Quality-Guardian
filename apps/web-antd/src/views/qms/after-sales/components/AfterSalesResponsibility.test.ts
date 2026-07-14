import { mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';

import { describe, expect, it, vi } from 'vitest';

import AfterSalesResponsibility from './AfterSalesResponsibility.vue';

vi.mock('@vben/locales', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@vben/locales')>()),
  useI18n: () => ({ t: (key: string) => key }),
}));
vi.mock('ant-design-vue', async () => {
  const { defineComponent, h } = await import('vue');
  const SlotComponent = defineComponent({
    setup(_, { slots }) {
      return () => h('div', slots.default?.());
    },
  });
  const EmptyComponent = defineComponent({
    inheritAttrs: false,
    setup() {
      return () => h('div');
    },
  });
  return {
    FormItem: SlotComponent,
    InputNumber: EmptyComponent,
    TreeSelect: EmptyComponent,
  };
});

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

describe('after-sales supplier identity', () => {
  it('binds the supplier ID and keeps the name snapshot', async () => {
    const formState = {
      supplierBrand: 'Legacy Supplier',
      supplierBrandId: 'supplier-old',
    };
    const wrapper = mount(AfterSalesResponsibility, {
      props: {
        deptTreeData: [],
        formState,
        isPurchasingDept: true,
      },
      global: {
        stubs: {
          SupplierSelect: SupplierSelectStub,
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

    expect(formState).toEqual({
      supplierBrand: 'Supplier A',
      supplierBrandId: 'supplier-1',
    });
  });
});
