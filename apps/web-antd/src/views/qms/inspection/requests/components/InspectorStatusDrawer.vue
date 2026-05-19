<script setup lang="ts">
import { Drawer, Tag } from 'ant-design-vue';

type InspectorStatusItem = {
  activeTaskCount: number;
  averageTaskMinutes: number;
  completedTaskCount: number;
  currentTaskMinutes: number;
  inspector: string;
  status: 'BUSY' | 'IDLE';
};

interface Props {
  open: boolean;
  items: InspectorStatusItem[];
  minutesText: (value?: number) => string;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  'update:open': [value: boolean];
}>();

function handleUpdateOpen(value: boolean) {
  emit('update:open', value);
}
</script>

<template>
  <Drawer
    :open="props.open"
    title="检验员状态"
    width="420"
    @update:open="handleUpdateOpen"
  >
    <div v-if="props.items.length > 0" class="space-y-2">
      <div
        v-for="item in props.items"
        :key="item.inspector"
        class="rounded border bg-white px-3 py-2"
      >
        <div class="flex items-center justify-between gap-2">
          <div class="min-w-0">
            <div class="truncate font-medium text-gray-900">
              {{ item.inspector || '未记录' }}
            </div>
            <div class="mt-0.5 text-xs text-gray-500">
              当前 {{ item.activeTaskCount }} 项 · 已用
              {{ props.minutesText(item.currentTaskMinutes) }}
            </div>
          </div>
          <Tag :color="item.status === 'BUSY' ? 'processing' : 'success'">
            {{ item.status === 'BUSY' ? '有任务' : '空闲' }}
          </Tag>
        </div>
        <div
          class="mt-2 grid grid-cols-2 gap-2 rounded bg-gray-50 px-2 py-2 text-xs text-gray-500"
        >
          <div>
            <div class="text-gray-400">完成数量</div>
            <div class="mt-0.5 font-medium text-gray-800">
              {{ item.completedTaskCount }}
            </div>
          </div>
          <div>
            <div class="text-gray-400">平均时长</div>
            <div class="mt-0.5 font-medium text-gray-800">
              {{ props.minutesText(item.averageTaskMinutes) }}
            </div>
          </div>
        </div>
      </div>
    </div>
    <div v-else class="py-10 text-center text-sm text-gray-400">
      暂无检验员状态数据
    </div>
  </Drawer>
</template>
