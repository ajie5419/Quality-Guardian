<script lang="ts" setup>
import type { AfterSalesFormState } from '#/types';

import { useI18n } from '@vben/locales';

import { FormItem, Textarea } from 'ant-design-vue';

const formState = defineModel<AfterSalesFormState>('formState', {
  required: true,
});

const { t } = useI18n();
</script>

<template>
  <div class="rounded-lg border border-blue-100 bg-blue-50/30 p-3">
    <FormItem
      :label="t('qms.afterSales.form.issueDescription')"
      class="mb-2"
      name="issueDescription"
    >
      <Textarea v-model:value="formState.issueDescription" :rows="4" />
    </FormItem>
    <FormItem :label="t('qms.afterSales.form.resolutionPlan')" class="mb-0">
      <Textarea v-model:value="formState.resolutionPlan" :rows="4" />
    </FormItem>
  </div>
</template>
