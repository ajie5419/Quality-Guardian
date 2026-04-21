<script lang="ts" setup>
import type { WorkOrderRequirementBoardFilter } from '#/api/qms/work-order';

const props = defineProps<{
  loading: boolean;
  overview: {
    confirmedRequirements: number;
    overdueUnconfirmedRequirements: number;
    pendingRequirements: number;
    plannedRequirements: number;
  };
}>();

const emit = defineEmits<{
  (e: 'open', filter: WorkOrderRequirementBoardFilter): void;
}>();

const cards: Array<{
  colorClass: string;
  filter: WorkOrderRequirementBoardFilter;
  key:
    | 'confirmedRequirements'
    | 'overdueUnconfirmedRequirements'
    | 'pendingRequirements'
    | 'plannedRequirements';
  label: string;
}> = [
  {
    colorClass: 'text-blue-600',
    filter: 'all',
    key: 'plannedRequirements',
    label: '任务总数',
  },
  {
    colorClass: 'text-green-600',
    filter: 'confirmed',
    key: 'confirmedRequirements',
    label: '已完成',
  },
  {
    colorClass: 'text-amber-600',
    filter: 'pending',
    key: 'pendingRequirements',
    label: '未完成',
  },
  {
    colorClass: 'text-red-600',
    filter: 'overdue',
    key: 'overdueUnconfirmedRequirements',
    label: '超10天未关注',
  },
];
</script>

<template>
  <div class="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
    <button
      v-for="card in cards"
      :key="card.key"
      type="button"
      class="rounded-lg border border-gray-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md"
      @click="emit('open', card.filter)"
    >
      <div class="text-sm text-gray-500">{{ card.label }}</div>
      <div
        class="mt-3 text-3xl font-extrabold leading-none"
        :class="card.colorClass"
      >
        {{ loading ? '-' : Number(props.overview[card.key] || 0) }}
      </div>
      <div class="mt-2 text-xs text-gray-400">点击查看聚合任务</div>
    </button>
  </div>
</template>
