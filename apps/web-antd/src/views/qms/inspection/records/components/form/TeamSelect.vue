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
    const findProductionObuAndChildren = (nodes: any[]) => {
      for (const node of nodes) {
        // 判断当前节点是否是目标 OBU
        const isProductionObu =
          node.name.includes('生产') || node.name.includes('制造');

        if (isProductionObu) {
          // 找到了 OBU，收集它的直接子节点（车间/班组）
          if (node.children && node.children.length > 0) {
            // 收集子节点（不论是否为叶子，只要是 OBU 的直接下级）
            node.children.forEach((child: any) => {
              targetDepts.push(child);
            });
            // 找到一个 OBU 后通常可以停止，或者继续找其他并行的 OBU
            // 这里假设只有一个主要的生产 OBU，找到即停止当前分支的递归，避免重复
            // 如果需要收集多个 OBU，可以移除 return，但要处理去重
            // 暂时逻辑：找到一个就认作是目标，提取其子项
          }
          // 注意：我们不再递归进入这个 OBU 的子节点去寻找其他 OBU，只取其直接子级作为选项
          // 如果 OBU 下面还有嵌套结构（如 车间 -> 班组），目前的逻辑只取 "车间" 这一层
          // 如果用户希望连班组也显示，需要改为收集 OBU 下的所有后代叶子节点
          // 根据 "下级单位...只是抬得子节点" 的描述，推测是指直接下级或有效下级
        } else {
          // 当前节点不是 OBU，继续在其子节点中寻找 OBU
          if (node.children && node.children.length > 0) {
            findProductionObuAndChildren(node.children);
          }
        }
      }
    };

    findProductionObuAndChildren(deptList as any[]);

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
