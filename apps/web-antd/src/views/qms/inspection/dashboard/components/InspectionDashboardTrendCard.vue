<script lang="ts" setup>
import { Card } from 'ant-design-vue';

defineProps<{
  hasData: boolean;
  rangeLabel: string;
}>();
</script>

<template>
  <Card :body-style="{ padding: '16px' }">
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div>
        <div class="font-medium text-gray-900">每日报检数量</div>
        <div class="mt-1 text-xs text-gray-500">
          按报检日期汇总，完成数量作为对比线
        </div>
      </div>
      <span class="text-xs text-gray-500">{{ rangeLabel }}</span>
    </div>
    <div class="min-h-[320px] rounded bg-gray-50 p-3">
      <slot v-if="hasData"></slot>
      <div
        v-else
        class="flex h-[300px] items-center justify-center text-sm text-gray-400"
      >
        当前范围暂无报检趋势数据
      </div>
    </div>
  </Card>
</template>
