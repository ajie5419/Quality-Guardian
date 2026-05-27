<script setup lang="ts">
interface RequestStats {
  pendingDispatchCount: number;
  pendingInspectionCount: number;
  todayClosedCount: number;
  todaySubmittedCount: number;
}

interface Props {
  exceptionTaskCount: number;
  stats: RequestStats;
}

const props = defineProps<Props>();
</script>

<template>
  <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
    <div class="rounded border border-blue-100 bg-blue-50 px-4 py-3">
      <div class="text-xs text-blue-700">待派单</div>
      <div class="mt-1 text-2xl font-semibold text-blue-900">
        {{ props.stats.pendingDispatchCount }}
      </div>
      <div class="mt-1 text-xs text-blue-600">
        今日报检 {{ props.stats.todaySubmittedCount }}
      </div>
    </div>

    <div class="rounded border border-amber-100 bg-amber-50 px-4 py-3">
      <div class="text-xs text-amber-700">待检验</div>
      <div class="mt-1 text-2xl font-semibold text-amber-900">
        {{ props.stats.pendingInspectionCount }}
      </div>
      <div class="mt-1 text-xs text-amber-600">含待复检任务</div>
    </div>

    <div class="rounded border border-emerald-100 bg-emerald-50 px-4 py-3">
      <div class="text-xs text-emerald-700">今日完成</div>
      <div class="mt-1 text-2xl font-semibold text-emerald-900">
        {{ props.stats.todayClosedCount }}
      </div>
      <div class="mt-1 text-xs text-emerald-600">检验关闭任务</div>
    </div>

    <div class="rounded border border-red-100 bg-red-50 px-4 py-3">
      <div class="text-xs text-red-700">待处理异常</div>
      <div class="mt-1 text-2xl font-semibold text-red-900">
        {{ props.exceptionTaskCount }}
      </div>
      <div class="mt-1 text-xs text-red-600">当前列表不合格或已关联问题</div>
    </div>
  </div>
</template>
