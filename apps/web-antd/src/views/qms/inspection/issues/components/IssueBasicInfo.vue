<script lang="ts" setup>
import type { DeptNode, IssueFormState } from '../types';

import { computed } from 'vue';

import { useI18n } from '@vben/locales';

import {
  DatePicker,
  FormItem,
  FormItemRest,
  Input,
  InputNumber,
  Switch,
  TreeSelect,
} from 'ant-design-vue';

import SupplierSelect from '../../../shared/components/SupplierSelect.vue';
import WorkOrderSelect from '../../../shared/components/WorkOrderSelect.vue';
import { DEPT_TYPE_KEYWORDS } from '../constants';

const props = defineProps<{
  deptTreeData: DeptNode[];
  isEditMode: boolean;
}>();

const emit = defineEmits<{
  searchWorkOrder: [string];
  'update:isAutoNc': [boolean];
  workOrderChange: [string];
}>();
const formState = defineModel<IssueFormState>('formState', { required: true });
const isAutoNc = defineModel<boolean>('isAutoNc', { default: false });

const { t } = useI18n();

// 辅助函数：根据 ID 查找部门名称
function findDeptTitle(tree: DeptNode[], value?: string): string | undefined {
  if (!value) return undefined;
  for (const node of tree) {
    // 兼容 title 或 label 字段
    const nodeTitle = (node as any).title || (node as any).label;
    if (node.value === value) return nodeTitle;
    if (node.children) {
      const found = findDeptTitle(node.children, value);
      if (found) return found;
    }
  }
  return undefined;
}

const selectedDeptName = computed(() => {
  return findDeptTitle(
    props.deptTreeData,
    formState.value.responsibleDepartment,
  );
});

const isPurchaseDept = computed(() => {
  const name = selectedDeptName.value || '';
  return name.includes(DEPT_TYPE_KEYWORDS.PURCHASE);
});

const isProductionDept = computed(() => {
  const name = selectedDeptName.value || '';
  // 匹配“履约”或“生产”
  return name.includes(DEPT_TYPE_KEYWORDS.PRODUCTION) || name.includes('生产');
});

const isOutsourcedDept = computed(() => {
  const name = selectedDeptName.value || '';
  return name.includes(DEPT_TYPE_KEYWORDS.OUTSOURCED);
});

const targetUnitCategory = computed(() => {
  if (isPurchaseDept.value) return 'Supplier';
  // 生产部门与外协部门逻辑一致，都查询外协单位
  if (isOutsourcedDept.value || isProductionDept.value) return 'Outsourcing';
  return 'Supplier';
});

function handleWorkOrderChange(val: any, option: any) {
  // If WorkOrderSelect returns the full item via option.item, use it directly
  const wo = option?.item;

  if (!wo) {
    // Search in local list is removed as we use the full item from selection component
    // If needed, the WorkOrderSelect should be trusted
  }

  if (wo) {
    formState.value.projectName = wo.projectName || '';
    formState.value.division = wo.division || '';
    emit('workOrderChange', wo.workOrderNumber);
  } else {
    emit('workOrderChange', String(val));
  }
}
</script>

<template>
  <div class="space-y-4">
    <!-- 不合格单号 -->
    <FormItem :label="t('qms.inspection.issues.ncNumber')" name="ncNumber">
      <div class="flex items-center gap-2">
        <div class="relative flex-1">
          <Input
            v-model:value="formState.ncNumber"
            :placeholder="t('qms.inspection.issues.generateNumberPlaceholder')"
            readonly
            disabled
          />
        </div>
        <FormItemRest v-if="!isEditMode">
          <div class="flex flex-shrink-0 items-center gap-2">
            <span class="text-xs text-gray-400">自动生成</span>
            <Switch v-model:checked="isAutoNc" size="small" />
          </div>
        </FormItemRest>
      </div>
    </FormItem>

    <!-- 报告日期 -->
    <FormItem :label="t('qms.inspection.issues.reportDate')" name="reportDate">
      <DatePicker
        v-model:value="formState.reportDate"
        value-format="YYYY-MM-DD"
        class="w-full"
      />
    </FormItem>

    <!-- 关联工单 -->
    <FormItem
      :label="t('qms.workOrder.workOrderNumber')"
      name="workOrderNumber"
    >
      <WorkOrderSelect
        v-model:value="formState.workOrderNumber"
        :placeholder="t('qms.inspection.issues.selectWorkOrder')"
        @change="handleWorkOrderChange"
      />
    </FormItem>

    <!-- 项目名称 (自动填充) -->
    <FormItem :label="t('qms.workOrder.projectName')">
      <Input v-model:value="formState.projectName" readonly disabled />
    </FormItem>

    <!-- 部件名称 -->
    <FormItem :label="t('qms.inspection.issues.partName')" name="partName">
      <Input
        v-model:value="formState.partName"
        :placeholder="t('qms.inspection.issues.inputPartName')"
      />
    </FormItem>

    <!-- 数量 -->
    <FormItem :label="t('qms.workOrder.quantity')" name="quantity">
      <InputNumber v-model:value="formState.quantity" class="w-full" :min="1" />
    </FormItem>

    <!-- 事业部 -->
    <FormItem :label="t('qms.workOrder.division')">
      <Input v-model:value="formState.division" readonly disabled />
    </FormItem>

    <!-- 检验员 -->
    <FormItem :label="t('qms.inspection.issues.reportedBy')" name="inspector">
      <Input
        v-model:value="formState.inspector"
        :placeholder="t('common.pleaseInput')"
      />
    </FormItem>

    <!-- 责任部门 (TreeSelect) -->
    <FormItem
      :label="t('qms.inspection.issues.responsibleDepartment')"
      name="responsibleDepartment"
    >
      <TreeSelect
        v-model:value="formState.responsibleDepartment"
        :dropdown-style="{ maxHeight: '400px', overflow: 'auto' }"
        :placeholder="t('common.pleaseSelect')"
        :tree-data="deptTreeData"
        class="w-full"
        tree-default-expand-all
      />
    </FormItem>

    <FormItem
      v-if="isPurchaseDept || isProductionDept || isOutsourcedDept"
      :label="t('qms.inspection.issues.responsibleUnit')"
      name="supplierName"
    >
      <SupplierSelect
        :key="targetUnitCategory"
        v-model:value="formState.supplierName"
        :placeholder="t('qms.inspection.issues.inputSupplier')"
        :category="targetUnitCategory"
      />
    </FormItem>
  </div>
</template>
