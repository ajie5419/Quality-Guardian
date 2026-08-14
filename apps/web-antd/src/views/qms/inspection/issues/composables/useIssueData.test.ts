import { mount } from '@vue/test-utils';
import { defineComponent, nextTick, ref } from 'vue';

import { TreeSelect } from 'ant-design-vue';
import { describe, expect, it } from 'vitest';

import { mapIssueDepartmentTreeNode } from './useIssueData';

const issueDepartmentTree = [
  mapIssueDepartmentTreeNode({
    id: 'dept-1770026473133',
    name: '质量部',
  }),
  mapIssueDepartmentTreeNode({
    id: 'dept-machining',
    name: '机加 BU',
  }),
];

describe('inspection issue department TreeSelect', () => {
  it('replaces an async canonical ID fallback with its department title', async () => {
    const Harness = defineComponent({
      components: { TreeSelect },
      setup() {
        return {
          selectedDepartmentId: ref('dept-1770026473133'),
          treeData: ref<typeof issueDepartmentTree>([]),
        };
      },
      template: `
        <TreeSelect
          v-model:value="selectedDepartmentId"
          :tree-data="treeData"
          tree-node-filter-prop="title"
          tree-node-label-prop="title"
        />
      `,
    });
    const wrapper = mount(Harness, {
      attachTo: document.body,
    });

    wrapper.vm.treeData = issueDepartmentTree;
    await nextTick();

    expect(wrapper.get('.ant-select-selection-item').text()).toBe('质量部');
    expect(wrapper.vm.selectedDepartmentId).toBe('dept-1770026473133');

    wrapper
      .findComponent(TreeSelect)
      .vm.$emit('update:value', 'dept-machining');
    await nextTick();

    expect(wrapper.vm.selectedDepartmentId).toBe('dept-machining');
    expect(wrapper.get('.ant-select-selection-item').text()).toBe('机加 BU');

    wrapper.unmount();
  });
});
