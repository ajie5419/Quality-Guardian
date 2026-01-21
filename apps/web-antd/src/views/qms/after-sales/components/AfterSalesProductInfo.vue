<script lang="ts" setup>
import type { AfterSalesFormState } from '../composables/useAfterSalesForm';

import { useI18n } from '@vben/locales';

import {
  DatePicker,
  FormItem,
  Input,
  InputNumber,
  Select,
  SelectOption,
} from 'ant-design-vue';

import { PRODUCT_OPTIONS } from '../constants';

defineProps<{
  productSubtypes: string[];
}>();

const emit = defineEmits<{
  productTypeChange: [];
}>();

const formState = defineModel<AfterSalesFormState>('formState', {
  required: true,
});

const { t } = useI18n();
</script>

<template>
  <div class="rounded-lg border border-gray-100 bg-gray-50/50 p-3">
    <div class="mb-3 border-l-4 border-blue-500 pl-2 font-bold text-gray-700">
      {{ t('qms.afterSales.form.productInfo') }}
    </div>
    <div class="space-y-3">
      <div class="grid grid-cols-2 gap-2">
        <FormItem
          :label="t('qms.afterSales.form.partName')"
          class="mb-0"
          name="partName"
        >
          <Input v-model:value="formState.partName" />
        </FormItem>
        <FormItem :label="t('qms.afterSales.form.factoryDate')" class="mb-0">
          <DatePicker
            v-model:value="formState.factoryDate"
            value-format="YYYY-MM-DD"
            class="w-full"
          />
        </FormItem>
      </div>
      <div class="grid grid-cols-2 gap-2">
        <FormItem :label="t('qms.afterSales.form.productType')" class="mb-0">
          <Select
            v-model:value="formState.productType"
            @change="emit('productTypeChange')"
            :placeholder="t('qms.afterSales.placeholder.selectType')"
          >
            <SelectOption
              v-for="opt in PRODUCT_OPTIONS"
              :key="opt"
              :value="opt"
            >
              {{ opt }}
            </SelectOption>
          </Select>
        </FormItem>
        <FormItem :label="t('qms.afterSales.form.productSubtype')" class="mb-0">
          <Select
            v-model:value="formState.productSubtype"
            :placeholder="t('qms.afterSales.placeholder.selectSubtype')"
          >
            <SelectOption
              v-for="opt in productSubtypes"
              :key="opt"
              :value="opt"
            >
              {{ opt }}
            </SelectOption>
          </Select>
        </FormItem>
      </div>
      <div class="grid grid-cols-2 gap-2">
        <FormItem :label="t('qms.afterSales.form.warrantyStatus')" class="mb-0">
          <Select v-model:value="formState.warrantyStatus">
            <SelectOption value="在保">{{
              t('qms.afterSales.options.underWarranty')
            }}</SelectOption>
            <SelectOption value="过保">{{
              t('qms.afterSales.options.expired')
            }}</SelectOption>
          </Select>
        </FormItem>
        <FormItem :label="t('qms.afterSales.form.runningHours')" class="mb-0">
          <InputNumber v-model:value="formState.runningHours" class="w-full" />
        </FormItem>
      </div>
    </div>
  </div>
</template>
