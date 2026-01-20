<script lang="ts" setup>
import type { AfterSalesFormState } from '../composables/useAfterSalesForm';

import { createIconifyIcon } from '@vben/icons';
import { useI18n } from '@vben/locales';

import {
  DatePicker,
  FormItem,
  Input,
  InputNumber,
  Select,
  SelectOption,
  Tooltip,
} from 'ant-design-vue';

import { DEFECT_OPTIONS, SEVERITY_OPTIONS, SEVERITY_TOOLTIPS } from '../constants';

defineProps<{
  defectSubtypes: string[];
}>();

const formState = defineModel<AfterSalesFormState>('formState', { required: true });

const emit = defineEmits<{
  defectTypeChange: [];
}>();

const { t } = useI18n();
const HelpIcon = createIconifyIcon('lucide:circle-help');
</script>

<template>
  <div class="rounded-lg border border-gray-100 bg-gray-50/50 p-3">
    <div class="mb-3 border-l-4 border-blue-500 pl-2 font-bold text-gray-700">
      {{ t('qms.afterSales.form.issueDetails') }}
    </div>
    <div class="space-y-3">
      <div class="grid grid-cols-2 gap-2">
        <FormItem :label="t('qms.afterSales.form.issueDate')" class="mb-0" name="issueDate">
          <DatePicker
            v-model:value="formState.issueDate"
            value-format="YYYY-MM-DD"
            class="w-full"
          />
        </FormItem>
        <FormItem :label="t('qms.afterSales.form.location')" class="mb-0" name="location">
          <Input v-model:value="formState.location" />
        </FormItem>
      </div>
      
      <FormItem class="mb-0" name="severity">
        <template #label>
          <span class="flex items-center gap-1">
            {{ t('qms.afterSales.form.severity') }}
            <Tooltip placement="top">
              <template #title>
                <div class="text-xs">
                  <p v-for="tip in SEVERITY_TOOLTIPS" :key="tip.level" class="mb-1">
                    <strong>{{ tip.level }}</strong>：{{ tip.desc }}
                  </p>
                </div>
              </template>
              <HelpIcon class="ml-1 cursor-help text-gray-400" />
            </Tooltip>
          </span>
        </template>
        <Select v-model:value="formState.severity">
          <SelectOption v-for="opt in SEVERITY_OPTIONS" :key="opt" :value="opt">
            {{ opt }}
          </SelectOption>
        </Select>
      </FormItem>
      
      <div class="grid grid-cols-2 gap-2">
        <FormItem :label="t('qms.afterSales.form.defectType')" class="mb-0" name="defectType">
          <Select
            v-model:value="formState.defectType"
            @change="emit('defectTypeChange')"
          >
            <SelectOption v-for="opt in DEFECT_OPTIONS" :key="opt" :value="opt">
              {{ opt }}
            </SelectOption>
          </Select>
        </FormItem>
        <FormItem :label="t('qms.afterSales.form.defectSubtype')" class="mb-0">
          <Select v-model:value="formState.defectSubtype">
            <SelectOption v-for="opt in defectSubtypes" :key="opt" :value="opt">
              {{ opt }}
            </SelectOption>
          </Select>
        </FormItem>
      </div>
      
      <div class="grid grid-cols-2 gap-2">
        <FormItem :label="t('qms.afterSales.form.quantity')" class="mb-0" name="quantity">
          <InputNumber v-model:value="formState.quantity" class="w-full" />
        </FormItem>
        <FormItem :label="t('qms.afterSales.form.handler')" class="mb-0">
          <Input v-model:value="formState.handler" />
        </FormItem>
      </div>
    </div>
  </div>
</template>
