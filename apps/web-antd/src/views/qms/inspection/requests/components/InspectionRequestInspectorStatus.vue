<script setup lang="ts">
import { Button, Tag } from 'ant-design-vue';

interface InspectorStatusItem {
  activeTaskCount: number;
  averageTaskMinutes: number;
  completedTaskCount: number;
  currentTaskMinutes: number;
  inspectorId: string;
  inspector: string;
  status: 'BUSY' | 'IDLE';
}

interface Props {
  busyCount: number;
  hasItems: boolean;
  idleCount: number;
  items: InspectorStatusItem[];
  minutesText: (value?: number) => string;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  openAll: [];
}>();
</script>

<template>
  <div class="mb-2 flex items-center justify-between gap-3">
    <div class="flex items-center gap-2">
      <span class="text-sm font-medium text-gray-900">检验员状态</span>
      <Tag color="success">空闲 {{ props.idleCount }}</Tag>
      <Tag color="processing">忙碌 {{ props.busyCount }}</Tag>
    </div>
    <Button
      v-if="props.hasItems"
      type="link"
      size="small"
      @click="emit('openAll')"
    >
      查看全部
    </Button>
  </div>
  <div v-if="props.items.length > 0" class="flex gap-2 overflow-x-auto pb-1">
    <button
      v-for="item in props.items"
      :key="item.inspector"
      class="min-w-[180px] rounded border bg-white px-3 py-2 text-left transition hover:border-blue-300 hover:shadow-sm"
      type="button"
      @click="emit('openAll')"
    >
      <div class="flex items-center justify-between gap-2">
        <span class="truncate text-sm font-medium text-gray-900">
          {{ item.inspector || '未记录' }}
        </span>
        <Tag :color="item.status === 'BUSY' ? 'processing' : 'success'">
          {{ item.status === 'BUSY' ? '有任务' : '空闲' }}
        </Tag>
      </div>
      <div class="mt-1 text-xs text-gray-500">
        当前 {{ item.activeTaskCount }} 项 · 已用
        {{ props.minutesText(item.currentTaskMinutes) }}
      </div>
      <div class="mt-0.5 text-xs text-gray-400">
        完成 {{ item.completedTaskCount }} · 均
        {{ props.minutesText(item.averageTaskMinutes) }}
      </div>
    </button>
  </div>
  <div v-else class="py-3 text-sm text-gray-400">暂无检验员状态数据</div>
</template>
