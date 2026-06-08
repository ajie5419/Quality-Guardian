<script lang="ts" setup>
defineProps<{
  averageDailySubmittedCount: number;
  busiestDailyTrend?: {
    date: string;
    submittedCount: number;
  };
  rangeLabel: string;
  stats: {
    dailyTrend: Array<unknown>;
    pendingDispatchCount: number;
    pendingInspectionCount: number;
    todayClosedCount: number;
    todayClosedIncomingCount: number;
    todayClosedProcessCount: number;
    todaySubmittedCount: number;
    todaySubmittedIncomingCount: number;
    todaySubmittedProcessCount: number;
  };
}>();
</script>

<template>
  <div class="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
    <div class="rounded border bg-white p-4">
      <div class="text-sm font-medium text-gray-600">报检数量</div>
      <div class="mt-3 text-3xl font-semibold text-blue-900">
        {{ stats.todaySubmittedCount }}
      </div>
      <div class="mt-1 text-xs text-gray-400">
        过程 {{ stats.todaySubmittedProcessCount }} · 进货
        {{ stats.todaySubmittedIncomingCount }}
      </div>
      <div class="mt-2 flex items-center justify-between text-xs">
        <span class="text-gray-500">{{ rangeLabel }}</span>
        <span class="text-blue-700">
          待派单 {{ stats.pendingDispatchCount }}
        </span>
      </div>
    </div>
    <div class="rounded border bg-white p-4">
      <div class="text-sm font-medium text-gray-600">完成数量</div>
      <div class="mt-3 text-3xl font-semibold text-green-900">
        {{ stats.todayClosedCount }}
      </div>
      <div class="mt-1 text-xs text-gray-400">
        过程 {{ stats.todayClosedProcessCount }} · 进货
        {{ stats.todayClosedIncomingCount }}
      </div>
      <div class="mt-2 flex items-center justify-between text-xs">
        <span class="text-gray-500">待检验任务</span>
        <span class="text-green-700">
          {{ stats.pendingInspectionCount }}
        </span>
      </div>
    </div>
    <div class="rounded border bg-white p-4">
      <div class="text-sm font-medium text-gray-600">平均每日报检</div>
      <div class="mt-3 text-3xl font-semibold text-cyan-900">
        {{ averageDailySubmittedCount }}
      </div>
      <div class="mt-2 text-xs text-gray-500">
        统计 {{ stats.dailyTrend.length }} 天
      </div>
    </div>
    <div class="rounded border bg-white p-4">
      <div class="text-sm font-medium text-gray-600">最高日峰值</div>
      <div class="mt-3 text-3xl font-semibold text-orange-900">
        {{ busiestDailyTrend?.submittedCount || 0 }}
      </div>
      <div class="mt-2 text-xs text-gray-500">
        {{ busiestDailyTrend?.date || rangeLabel }}
      </div>
    </div>
  </div>
</template>
