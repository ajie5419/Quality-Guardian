import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent } from 'vue';

import { describe, expect, it, vi } from 'vitest';

import BomItemSelect from './BomItemSelect.vue';

const { getBomList } = vi.hoisted(() => ({ getBomList: vi.fn() }));

vi.mock('#/api/qms/planning', () => ({ getBomList }));
vi.mock('#/hooks/useErrorHandler', () => ({
  useErrorHandler: () => ({ handleApiError: vi.fn() }),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('bom item select', () => {
  it('ignores a stale response after the work order changes', async () => {
    const SelectProbe = defineComponent({
      name: 'ASelect',
      props: { options: { default: () => [], type: Array } },
      template: '<div data-testid="select-probe" />',
    });
    const first = deferred<any[]>();
    const second = deferred<any[]>();
    getBomList
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);

    const wrapper = mount(BomItemSelect, {
      props: { workOrderNumber: 'WO-A' },
      global: { stubs: { ASelect: SelectProbe, Select: SelectProbe } },
    });
    await wrapper.setProps({ workOrderNumber: 'WO-B' });

    second.resolve([{ id: 'bom-b', partName: '部件 B', partNumber: 'B-1' }]);
    await flushPromises();
    first.resolve([{ id: 'bom-a', partName: '部件 A', partNumber: 'A-1' }]);
    await flushPromises();

    const select = wrapper.findComponent(SelectProbe);
    expect(select.props('options')).toEqual([
      expect.objectContaining({ label: '部件 B (B-1)', value: '部件 B' }),
    ]);
  });
});
