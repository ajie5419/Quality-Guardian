import { flushPromises, mount } from '@vue/test-utils';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import SupplierSelect from './SupplierSelect.vue';

const { getSupplierList, handleApiError } = vi.hoisted(() => ({
  getSupplierList: vi.fn(),
  handleApiError: vi.fn(),
}));

vi.mock('#/api/qms/supplier', () => ({ getSupplierList }));
vi.mock('#/hooks/useErrorHandler', () => ({
  useErrorHandler: () => ({ handleApiError }),
}));

vi.mock('ant-design-vue', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    Select: defineComponent({
      name: 'MockSupplierSelectProbe',
      props: {
        options: { default: () => [], type: Array },
        value: { default: undefined, type: String },
      },
      emits: ['change', 'popupScroll', 'search'],
      setup() {
        return () => h('div', { 'data-testid': 'select-probe' });
      },
    }),
  };
});

function createSupplier(id: string, name: string) {
  return {
    brand: '',
    buyer: '',
    category: 'Supplier' as const,
    id,
    name,
    origin: '',
    productName: '',
    project: '',
    score2025: 0,
  };
}

describe('supplier select', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSupplierList.mockResolvedValue({ items: [], total: 0 });
  });

  it('keeps name values as the compatibility default', async () => {
    getSupplierList.mockResolvedValueOnce({
      items: [createSupplier('supplier-1', 'Supplier A')],
      total: 1,
    });

    const wrapper = mount(SupplierSelect);
    await flushPromises();

    expect(
      wrapper
        .findComponent({ name: 'MockSupplierSelectProbe' })
        .props('options'),
    ).toEqual([
      expect.objectContaining({
        label: 'Supplier A',
        value: 'Supplier A',
      }),
    ]);
  });

  it('uses canonical supplier ids in id mode', async () => {
    getSupplierList.mockResolvedValueOnce({
      items: [createSupplier('supplier-1', 'Supplier A')],
      total: 1,
    });

    const wrapper = mount(SupplierSelect, {
      props: { valueMode: 'id' },
    });
    await flushPromises();

    expect(
      wrapper
        .findComponent({ name: 'MockSupplierSelectProbe' })
        .props('options'),
    ).toEqual([
      expect.objectContaining({
        label: 'Supplier A',
        value: 'supplier-1',
      }),
    ]);
  });

  it('resolves a unique legacy name to its canonical id', async () => {
    const supplier = createSupplier('supplier-1', 'Supplier A');
    getSupplierList.mockResolvedValueOnce({ items: [supplier], total: 1 });

    const wrapper = mount(SupplierSelect, {
      props: {
        legacyName: ' Supplier A ',
        valueMode: 'id',
      },
    });
    await flushPromises();

    expect(getSupplierList).toHaveBeenCalledWith({
      category: 'Supplier',
      keyword: 'Supplier A',
      page: 1,
      pageSize: 100,
    });
    expect(wrapper.emitted('update:value')).toEqual([['supplier-1']]);
    expect(wrapper.emitted('change')?.[0]).toEqual([
      'supplier-1',
      expect.objectContaining({ item: supplier, value: 'supplier-1' }),
    ]);
  });

  it('loads the selected id option from its legacy name for edit echo', async () => {
    const supplier = createSupplier('supplier-42', 'Supplier Z');
    getSupplierList.mockResolvedValueOnce({ items: [supplier], total: 1 });

    const wrapper = mount(SupplierSelect, {
      props: {
        legacyName: 'Supplier Z',
        value: 'supplier-42',
        valueMode: 'id',
      },
    });
    await flushPromises();

    expect(
      wrapper
        .findComponent({ name: 'MockSupplierSelectProbe' })
        .props('options'),
    ).toEqual([
      expect.objectContaining({
        label: 'Supplier Z',
        value: 'supplier-42',
      }),
    ]);
    expect(wrapper.emitted('update:value')).toBeUndefined();
    expect(wrapper.emitted('change')).toBeUndefined();
  });

  it('uses the selected id to disambiguate duplicate legacy names', async () => {
    const selected = createSupplier('supplier-2', 'Supplier A');
    getSupplierList.mockResolvedValueOnce({
      items: [createSupplier('supplier-1', 'Supplier A'), selected],
      total: 2,
    });

    const wrapper = mount(SupplierSelect, {
      props: {
        legacyName: 'Supplier A',
        value: 'supplier-2',
        valueMode: 'id',
      },
    });
    await flushPromises();

    expect(
      wrapper
        .findComponent({ name: 'MockSupplierSelectProbe' })
        .props('options'),
    ).toEqual([
      expect.objectContaining({
        label: 'Supplier A',
        value: 'supplier-2',
      }),
    ]);
    expect(wrapper.emitted('update:value')).toBeUndefined();
  });

  it('does not guess when a legacy name matches multiple suppliers', async () => {
    getSupplierList.mockResolvedValueOnce({
      items: [
        createSupplier('supplier-1', 'Supplier A'),
        createSupplier('supplier-2', 'Supplier A'),
      ],
      total: 2,
    });

    const wrapper = mount(SupplierSelect, {
      props: { legacyName: 'Supplier A', valueMode: 'id' },
    });
    await flushPromises();

    expect(wrapper.emitted('update:value')).toBeUndefined();
    expect(wrapper.emitted('change')).toBeUndefined();
  });

  it('resolves a legacy name from another category when the filtered search misses', async () => {
    const outsourcing = {
      ...createSupplier('supplier-9', 'Outsourcing Supplier'),
      category: 'Outsourcing' as const,
    };
    getSupplierList
      .mockResolvedValueOnce({ items: [], total: 0 })
      .mockResolvedValueOnce({ items: [outsourcing], total: 1 });

    const wrapper = mount(SupplierSelect, {
      props: {
        legacyName: 'Outsourcing Supplier',
        value: 'supplier-9',
        valueMode: 'id',
      },
    });
    await flushPromises();

    expect(getSupplierList).toHaveBeenNthCalledWith(1, {
      category: 'Supplier',
      keyword: 'Outsourcing Supplier',
      page: 1,
      pageSize: 100,
    });
    expect(getSupplierList).toHaveBeenNthCalledWith(2, {
      keyword: 'Outsourcing Supplier',
      page: 1,
      pageSize: 100,
    });
    expect(
      wrapper
        .findComponent({ name: 'MockSupplierSelectProbe' })
        .props('options'),
    ).toEqual([
      expect.objectContaining({
        label: 'Outsourcing Supplier',
        value: 'supplier-9',
      }),
    ]);
    expect(wrapper.emitted('update:value')).toBeUndefined();
    expect(wrapper.emitted('change')).toBeUndefined();
  });

  it('falls back across categories when the selected id misses a same-name supplier', async () => {
    const outsourcing = {
      ...createSupplier('supplier-9', 'Outsourcing Supplier'),
      category: 'Outsourcing' as const,
    };
    getSupplierList
      .mockResolvedValueOnce({
        items: [createSupplier('supplier-8', 'Outsourcing Supplier')],
        total: 1,
      })
      .mockResolvedValueOnce({ items: [outsourcing], total: 1 });

    const wrapper = mount(SupplierSelect, {
      props: {
        legacyName: 'Outsourcing Supplier',
        value: 'supplier-9',
        valueMode: 'id',
      },
    });
    await flushPromises();

    expect(getSupplierList).toHaveBeenNthCalledWith(1, {
      category: 'Supplier',
      keyword: 'Outsourcing Supplier',
      page: 1,
      pageSize: 100,
    });
    expect(getSupplierList).toHaveBeenNthCalledWith(2, {
      keyword: 'Outsourcing Supplier',
      page: 1,
      pageSize: 100,
    });
    expect(
      wrapper
        .findComponent({ name: 'MockSupplierSelectProbe' })
        .props('options'),
    ).toEqual([
      expect.objectContaining({
        label: 'Outsourcing Supplier',
        value: 'supplier-9',
      }),
    ]);
    expect(wrapper.emitted('update:value')).toBeUndefined();
    expect(wrapper.emitted('change')).toBeUndefined();
  });

  it('never guesses across categories without a preselected value', async () => {
    const wrapper = mount(SupplierSelect, {
      props: {
        legacyName: 'Outsourcing Supplier',
        valueMode: 'id',
      },
    });
    await flushPromises();

    expect(getSupplierList).toHaveBeenCalledTimes(1);
    expect(getSupplierList).toHaveBeenNthCalledWith(1, {
      category: 'Supplier',
      keyword: 'Outsourcing Supplier',
      page: 1,
      pageSize: 100,
    });
    expect(wrapper.emitted('update:value')).toBeUndefined();
    expect(wrapper.emitted('change')).toBeUndefined();
  });
});
