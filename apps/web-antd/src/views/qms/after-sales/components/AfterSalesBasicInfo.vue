<script lang="ts" setup>
import type { WorkOrderItem } from '#/api/qms/work-order';
import type { AfterSalesFormState, TreeSelectNode } from '#/types';

import { useI18n } from '@vben/locales';

import { FormItem, Input, TreeSelect } from 'ant-design-vue';

import WorkOrderSelect from '../../shared/components/WorkOrderSelect.vue';

defineProps<{
  deptTreeData: TreeSelectNode[];
}>();

const emit = defineEmits<{
  workOrderChange: [val: number | string, item?: WorkOrderItem];
}>();

const formState = defineModel<AfterSalesFormState>('formState', {
  required: true,
});

const { t } = useI18n();

function handleWorkOrderChange(
  val: number | string,
  option: { item?: WorkOrderItem },
) {
  emit('workOrderChange', val, option?.item);
}
</script>

<template>
  <div class="rounded-lg border border-gray-100 bg-gray-50/50 p-3">
    <div class="mb-3 border-l-4 border-blue-500 pl-2 font-bold text-gray-700">
      {{ t('qms.afterSales.form.baseInfo') }}
    </div>
    <div class="space-y-3">
      <FormItem
        :label="t('qms.afterSales.form.workOrderNumber')"
        class="mb-0"
        name="workOrderNumber"
      >
        <WorkOrderSelect
          v-model:value="formState.workOrderNumber"
          :placeholder="t('qms.afterSales.placeholder.inputWorkOrder')"
          @change="handleWorkOrderChange"
        />
      </FormItem>
      <div class="grid grid-cols-2 gap-2">
        <FormItem :label="t('qms.afterSales.form.division')" class="mb-0">
          <TreeSelect
            v-model:value="formState.division"
            :tree-data="deptTreeData"
            :placeholder="t('qms.afterSales.placeholder.selectDivision')"
            tree-default-expand-all
            class="w-full"
          />
        </FormItem>
        <FormItem :label="t('qms.afterSales.form.projectName')" class="mb-0">
          <Input v-model:value="formState.projectName" />
        </FormItem>
      </div>
      <FormItem
        :label="t('qms.afterSales.form.customerName')"
        class="mb-0"
        name="customerName"
      >
        <Input v-model:value="formState.customerName" />
      </FormItem>
    </div>
  </div>
</template>
