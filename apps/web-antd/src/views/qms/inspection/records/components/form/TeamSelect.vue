<script lang="ts" setup>
import type { Dept } from '#/api/system/dept';

import { onMounted, ref } from 'vue';

import { Select } from 'ant-design-vue';

import { getSupplierList } from '#/api/qms/supplier';
import { getDeptList } from '#/api/system/dept';
import { useErrorHandler } from '#/hooks/useErrorHandler';

defineOptions({ name: 'TeamSelect' });

defineProps({
  value: {
    type: String,
    default: undefined,
  },
  disabled: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(['update:value', 'change']);
const { handleApiError } = useErrorHandler();

const loading = ref(false);
const options = ref<
  Array<{ label: string; options: Array<{ label: string; value: string }> }>
>([]);

async function loadData() {
  loading.value = true;
  try {
    // 1. 获取部门 (过滤出叶子节点，即实际车间/班组，排除顶级公司节点)
    const [deptList, supplierRes] = await Promise.all([
      getDeptList(),
      getSupplierList({ page: 1, pageSize: 1000, category: 'outsourcing' }),
    ]);

    const targetDepts: Dept[] = [];

    // 精确类型定义
    const collectLeaves = (node: Dept, leaves: Dept[]) => {
      if (!node.children || node.children.length === 0) {
        leaves.push(node);
      } else {
        node.children.forEach((child) => collectLeaves(child, leaves));
      }
    };

    const findProductionObuAndCollectLeaves = (nodes: Dept[]) => {
      for (const node of nodes) {
        // 判断当前节点是否是目标 OBU
        const isProductionObu =
          node.name.includes('生产') || node.name.includes('制造');

        if (isProductionObu) {
          collectLeaves(node, targetDepts);
        } else {
          if (node.children && node.children.length > 0) {
            findProductionObuAndCollectLeaves(node.children);
          }
        }
      }
    };

    findProductionObuAndCollectLeaves(deptList);

    // 如果没有找到任何 OBU，作为兜底，还是显示所有叶子节点
    if (targetDepts.length === 0) {
      const findLeaves = (nodes: Dept[]) => {
        nodes.forEach((node) => {
          if (node.children && node.children.length > 0) {
            findLeaves(node.children);
          } else {
            targetDepts.push(node);
          }
        });
      };
      findLeaves(deptList);
    }

    const internalOptions = targetDepts.map((d) => ({
      label: d.name,
      value: d.name,
    }));

    const externalOptions = (supplierRes.items || []).map((s) => ({
      label: s.name,
      value: s.name,
    }));

    options.value = [
      { label: '内部生产车间', options: internalOptions },
      { label: '外协加工单位', options: externalOptions },
    ];
  } catch (error) {
    handleApiError(error, 'Load Team Select Data');
  } finally {
    loading.value = false;
  }
}

function handleChange(val: unknown) {
  emit('update:value', val);
  emit('change', val);
}

onMounted(() => {
  loadData();
});
</script>

<template>
  <Select
    :value="value"
    :options="options"
    :loading="loading"
    :disabled="disabled"
    placeholder="请选择或搜索班组/外协单位"
    show-search
    allow-clear
    @change="handleChange"
    style="width: 100%"
  />
</template>
