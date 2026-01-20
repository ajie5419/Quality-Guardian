<script lang="ts" setup>
import type { MatchedCase } from '../types';

import { useI18n } from '@vben/locales';

import { Button, Tag } from 'ant-design-vue';

defineProps<{
  cases: MatchedCase[];
}>();

const emit = defineEmits<{
  apply: [caseItem: MatchedCase];
}>();

const { t } = useI18n();
</script>

<template>
  <div class="mt-6 border-t pt-4">
    <template v-if="cases.length > 0">
      <div class="mb-3 font-bold text-gray-700">
        <span class="i-lucide-library mr-2"></span>
        {{ t('qms.inspection.issues.similarCases') }}
      </div>
      <div class="space-y-3">
        <div
          v-for="item in cases"
          :key="item.id"
          class="rounded-lg border border-blue-100 bg-blue-50/30 p-3"
        >
          <div class="mb-2 flex items-center justify-between">
            <span class="font-medium text-blue-800">{{ item.title }}</span>
            <Tag color="blue">
              {{ t('qms.inspection.issues.similarity') }}: {{ Math.round(item.similarity * 100) }}%
            </Tag>
          </div>
          <div class="text-xs text-gray-500">{{ item.description }}</div>
          <div class="mt-2 flex justify-end">
            <Button
              size="small"
              type="primary"
              ghost
              @click="emit('apply', item)"
            >
              {{ t('common.confirm') }}
            </Button>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
