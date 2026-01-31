<script lang="ts" setup>
import type { StatusOption } from '../constants';

import type { AfterSalesFormState } from '#/types';

import { useI18n } from '@vben/locales';

import { DatePicker, FormItem, Select, SelectOption } from 'ant-design-vue';

defineProps<{
  statusOptions: StatusOption[];
}>();

const formState = defineModel<AfterSalesFormState>('formState', {
  required: true,
});

const { t } = useI18n();
</script>

<template>
  <div class="rounded-lg border border-gray-100 bg-gray-50/50 p-3">
    <div class="mb-3 border-l-4 border-blue-500 pl-2 font-bold text-gray-700">
      {{ t('qms.afterSales.form.processingStatus') }}
    </div>
    <div class="space-y-3">
      <div class="grid grid-cols-2 gap-2">
        <FormItem
          :label="t('qms.afterSales.form.status')"
          class="mb-0"
          name="status"
        >
          <Select v-model:value="formState.status">
            <SelectOption
              v-for="opt in statusOptions"
              :key="opt.value"
              :value="opt.value"
            >
              {{ opt.label }}
            </SelectOption>
          </Select>
        </FormItem>
        <FormItem :label="t('qms.afterSales.form.isClaim')" class="mb-0">
          <Select
            :value="(formState.isClaim ? 'true' : 'false') as any"
            @change="(val: any) => (formState.isClaim = val === 'true')"
            :options="
              [
                { label: t('common.yes'), value: 'true' },
                { label: t('common.no'), value: 'false' },
              ] as any
            "
          />
        </FormItem>
      </div>
      <FormItem :label="t('qms.afterSales.form.closeDate')" class="mb-0">
        <DatePicker
          v-model:value="formState.closeDate"
          value-format="YYYY-MM-DD"
          class="w-full"
        />
      </FormItem>
    </div>
  </div>
</template>
