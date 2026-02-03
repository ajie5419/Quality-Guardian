<script lang="ts" setup>
import { onMounted, ref } from 'vue';

import { Select } from 'ant-design-vue';

import { getSupplierList } from '#/api/qms/supplier';
import { getDeptList } from '#/api/system/dept';

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

    const targetDepts: any[] = [];

    // 策略：精确定位 "生产 OBU" (或类似名称的部门)，然后只收集其【直接子节点】
    // 假设 "生产 OBU" 的名称包含 "生产" 或 "制造"
    // 辅助函数：收集指定节点下的所有叶子节点（即具体的班组）
    const collectLeaves = (node: any, leaves: any[]) => {
      if (!node.children || node.children.length === 0) {
        leaves.push(node);
      } else {
        node.children.forEach((child: any) => collectLeaves(child, leaves));
      }
    };

    // 策略：精确定位 "生产 OBU" (或类似名称的部门)，然后收集其下所有的【叶子节点】
    // 这样可以确保无论层级多深（OBU -> 车间 -> 班组），都能选到底层的班组
    const findProductionObuAndCollectLeaves = (nodes: any[]) => {
      for (const node of nodes) {
        // 判断当前节点是否是目标 OBU
        const isProductionObu =
          node.name.includes('生产') || node.name.includes('制造');

        if (isProductionObu) {
          // 找到了 OBU，递归收集它下面所有的叶子节点（班组）
          collectLeaves(node, targetDepts);
          // 找到当前分支的 OBU 后，不再深入寻找其他 OBU 标志，而是已经转为收集叶子了
        } else {
          // 当前节点不是 OBU，继续在其子节点中寻找 OBU
          if (node.children && node.children.length > 0) {
            findProductionObuAndCollectLeaves(node.children);
          }
        }
      }
    };

    findProductionObuAndCollectLeaves(deptList as any[]);

    // 如果没有找到任何 OBU，作为兜底，还是显示所有叶子节点，避免空列表
    if (targetDepts.length === 0) {
      const findLeaves = (nodes: any[]) => {
        nodes.forEach((node) => {
          if (node.children && node.children.length > 0) {
            findLeaves(node.children);
          } else {
            targetDepts.push(node);
          }
        });
      };
      findLeaves(deptList as any[]);
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
    console.error('Load team data failed:', error);
  } finally {
    loading.value = false;
  }
}

function handleChange(val: any) {
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
