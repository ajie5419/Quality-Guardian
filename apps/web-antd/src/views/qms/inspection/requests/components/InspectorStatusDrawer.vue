<script setup lang="ts">
import type { InspectionRequest } from '#/api/qms/inspection-request';

import { computed } from 'vue';

import { Drawer, Empty, Spin, Tag } from 'ant-design-vue';

import { useMobileViewport } from '#/hooks/useMobileViewport';

type InspectorStatusItem = {
  activeTaskCount: number;
  averageTaskMinutes: number;
  completedTaskCount: number;
  currentTaskMinutes: number;
  inspectorId: string;
  inspector: string;
  status: 'BUSY' | 'IDLE';
};

interface Props {
  open: boolean;
  items: InspectorStatusItem[];
  tasks: InspectionRequest[];
  taskLoading: boolean;
  minutesText: (value?: number) => string;
  formatDateTime: (value?: null | string) => string;
  statusColor: (status: InspectionRequest['status']) => string;
  statusLabel: (status: InspectionRequest['status']) => string;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  openTask: [record: InspectionRequest];
  selectInspector: [item: InspectorStatusItem];
  'update:open': [value: boolean];
}>();

function handleUpdateOpen(value: boolean) {
  emit('update:open', value);
}

const { isMobile } = useMobileViewport();
const drawerWidth = computed(() =>
  isMobile.value ? '100vw' : 'min(100vw, 860px)',
);
</script>

<template>
  <Drawer
    :open="props.open"
    title="检验员状态"
    :width="drawerWidth"
    @update:open="handleUpdateOpen"
  >
    <div
      v-if="props.items.length > 0"
      class="grid gap-3 md:grid-cols-[320px_minmax(0,1fr)]"
    >
      <div class="space-y-2">
        <button
          v-for="item in props.items"
          :key="item.inspectorId || item.inspector"
          class="w-full rounded border bg-white px-3 py-2 text-left transition hover:border-blue-300 hover:shadow-sm"
          type="button"
          @click="emit('selectInspector', item)"
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
        </button>
      </div>

      <div class="min-h-[280px] rounded border bg-white p-3">
        <div class="mb-3 flex items-center justify-between">
          <div class="text-sm font-medium text-gray-900">当前检验任务</div>
          <Tag color="blue">{{ props.tasks.length }} 项</Tag>
        </div>
        <Spin :spinning="props.taskLoading">
          <div v-if="props.tasks.length > 0" class="space-y-2">
            <button
              v-for="task in props.tasks"
              :key="task.id"
              class="w-full rounded border border-gray-100 bg-gray-50 px-3 py-2 text-left transition hover:border-blue-300 hover:bg-white"
              type="button"
              @click="emit('openTask', task)"
            >
              <div class="flex items-start justify-between gap-2">
                <div class="min-w-0">
                  <div class="truncate text-sm font-medium text-gray-900">
                    {{ task.workOrderNumber }} · {{ task.partName }}
                  </div>
                  <div class="mt-1 truncate text-xs text-gray-500">
                    {{ task.requestNo }} / {{ task.processName }}
                  </div>
                </div>
                <Tag :color="props.statusColor(task.status)">
                  {{ props.statusLabel(task.status) }}
                </Tag>
              </div>
              <div class="mt-2 grid grid-cols-2 gap-2 text-xs text-gray-500">
                <div>优先级 {{ task.priority || 3 }}</div>
                <div class="text-right">
                  {{ props.formatDateTime(task.dispatchedAt || task.submittedAt) }}
                </div>
              </div>
            </button>
          </div>
          <Empty
            v-else
            image="simple"
            description="点击左侧检验员查看当前任务"
          />
        </Spin>
      </div>
    </div>
    <div v-else class="py-10 text-center text-sm text-gray-400">
      暂无检验员状态数据
    </div>
  </Drawer>
</template>
