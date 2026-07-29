<script lang="ts" setup>
interface InspectorStat {
  averageTaskMinutes: number;
  completedTaskCount: number;
  inspector: string;
  inspectorId: null | string;
}

interface ReinspectionStat {
  inspectedCount: number;
  reinspectionCount: number;
  reinspectionRate: number;
  submittedCount: number;
  team: string;
  teamId: null | string;
}

interface TeamStat {
  count: number;
  team: string;
  teamId: null | string;
}

defineProps<{
  inspectorStats: InspectorStat[];
  minutesText: (value?: number) => string;
  reinspectionStats: ReinspectionStat[];
  teamStats: TeamStat[];
  view: 'inspector' | 'reinspection' | 'team';
}>();
</script>

<template>
  <div class="space-y-2">
    <template v-if="view === 'team'">
      <div
        v-for="(item, index) in teamStats"
        :key="item.teamId || 'unresolved-history-team'"
        class="flex items-center justify-between rounded bg-gray-50 px-3 py-2"
      >
        <div class="flex min-w-0 items-center gap-2">
          <span class="w-5 text-xs text-gray-400">{{ index + 1 }}</span>
          <span class="truncate text-sm text-gray-800">
            {{ item.team || '未填写' }}
          </span>
        </div>
        <span class="text-sm font-semibold text-gray-900">
          {{ item.count }}
        </span>
      </div>
    </template>

    <template v-else-if="view === 'reinspection'">
      <div
        v-for="(item, index) in reinspectionStats"
        :key="item.teamId || 'unresolved-history-reinspection'"
        class="rounded bg-gray-50 px-3 py-2"
      >
        <div class="flex items-center justify-between gap-2">
          <div class="flex min-w-0 items-center gap-2">
            <span class="w-5 text-xs text-gray-400">{{ index + 1 }}</span>
            <span class="truncate text-sm text-gray-800">
              {{ item.team || '未填写' }}
            </span>
          </div>
          <span class="text-sm font-semibold text-orange-600">
            {{ item.reinspectionRate }}%
          </span>
        </div>
        <div class="mt-1 text-xs text-gray-500">
          复检 {{ item.reinspectionCount }} / 已检 {{ item.inspectedCount }}
          <span class="text-gray-400"> · 报检 {{ item.submittedCount }} </span>
        </div>
      </div>
    </template>

    <template v-else>
      <div
        v-for="(item, index) in inspectorStats"
        :key="item.inspectorId || 'unresolved-history-inspector'"
        class="rounded bg-gray-50 px-3 py-2"
      >
        <div class="flex items-center justify-between gap-2">
          <div class="flex min-w-0 items-center gap-2">
            <span class="w-5 text-xs text-gray-400">{{ index + 1 }}</span>
            <span class="truncate text-sm text-gray-800">
              {{ item.inspector || '未记录' }}
            </span>
          </div>
          <span class="text-sm font-semibold text-gray-900">
            {{ item.completedTaskCount }}
          </span>
        </div>
        <div class="mt-1 text-xs text-gray-500">
          平均任务时长 {{ minutesText(item.averageTaskMinutes) }}
        </div>
      </div>
    </template>
  </div>
</template>
