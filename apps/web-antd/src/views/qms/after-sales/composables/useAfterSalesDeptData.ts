import type { DeptTreeNode, TreeSelectNode } from '#/types';

import { ref } from 'vue';

import { getDeptList } from '#/api/system/dept';
import { convertToTreeSelectData } from '#/types';

export function useAfterSalesDeptData() {
  const deptTreeData = ref<TreeSelectNode[]>([]);
  const deptRawData = ref<DeptTreeNode[]>([]);

  async function loadDeptData() {
    const data = await getDeptList();
    deptRawData.value = data;
    deptTreeData.value = convertToTreeSelectData(data);
  }

  return {
    deptTreeData,
    deptRawData,
    loadDeptData,
  };
}
