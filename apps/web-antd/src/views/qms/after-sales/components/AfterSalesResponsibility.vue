<script lang="ts" setup>
import type { AfterSalesFormState } from '../composables/useAfterSalesForm';

import type { QmsSupplierApi } from '#/api/qms/supplier';
import type { TreeSelectNode } from '#/types';

import { useI18n } from '@vben/locales';

import {
  FormItem,
  InputNumber,
  Select,
  SelectOption,
  TreeSelect,
} from 'ant-design-vue';

defineProps<{
  deptTreeData: TreeSelectNode[];
  isPurchasingDept: boolean;
  supplierList: QmsSupplierApi.SupplierItem[];
}>();

const formState = defineModel<AfterSalesFormState>('formState', {
  required: true,
});

const { t } = useI18n();
</script>

<template>
  <div class="rounded-lg border border-gray-100 bg-gray-50/50 p-3">
    <div class="mb-3 border-l-4 border-blue-500 pl-2 font-bold text-gray-700">
      {{ t('qms.afterSales.form.responsibility') }}
    </div>
    <div class="space-y-3">
      <FormItem
        :label="t('qms.afterSales.form.responsibleDept')"
        class="mb-0"
        name="responsibleDept"
      >
        <TreeSelect
          v-model:value="formState.responsibleDept"
          :tree-data="deptTreeData"
          placeholder="请选择责任部门"
          tree-default-expand-all
          class="w-full"
        />
      </FormItem>
      <FormItem
        v-if="isPurchasingDept"
        :label="t('qms.afterSales.form.supplierBrand')"
        class="mb-0"
      >
        <Select
          v-model:value="formState.supplierBrand"
          show-search
          :placeholder="t('qms.afterSales.placeholder.selectSupplier')"
        >
          <SelectOption
            v-for="sup in supplierList"
            :key="sup.id"
            :value="sup.name"
          >
            {{ sup.name }}
          </SelectOption>
        </Select>
      </FormItem>
      <div class="grid grid-cols-2 gap-2">
        <FormItem :label="t('qms.afterSales.form.materialCost')" class="mb-0">
          <InputNumber
            v-model:value="formState.materialCost"
            prefix="¥"
            class="w-full"
          />
        </FormItem>
        <FormItem
          :label="t('qms.afterSales.form.laborTravelCost')"
          class="mb-0"
        >
          <InputNumber
            v-model:value="formState.laborTravelCost"
            prefix="¥"
            class="w-full"
          />
        </FormItem>
      </div>
    </div>
  </div>
</template>
