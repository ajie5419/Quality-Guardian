<script lang="ts" setup>
import type { ChartConfig } from '#/components/Qms/ChartBuilder/types';

import { computed, onUnmounted, ref, watch } from 'vue';

import { useAccess } from '@vben/access';
import { useI18n } from '@vben/locales';

import { useStorage } from '@vueuse/core';
import { Button, Card, message, Modal } from 'ant-design-vue';

import { getDeptList } from '#/api/system/dept';
import { useErrorHandler } from '#/hooks/useErrorHandler';

import { UI_CONSTANTS } from '../constants';
import IssueCustomChartBuilderModal from './IssueCustomChartBuilderModal.vue';
import IssueCustomChartItem from './IssueCustomChartItem.vue';

const props = defineProps<{
  dateMode?: 'month' | 'week' | 'year';
  dateValue?: string;
  year?: number;
}>();

const { t } = useI18n();
const { hasAccessByCodes } = useAccess();
const { handleApiError } = useErrorHandler();

const canEdit = computed(() =>
  hasAccessByCodes(['QMS:Inspection:Issues:ChartEdit']),
);
const canDelete = computed(() =>
  hasAccessByCodes(['QMS:Inspection:Issues:ChartDelete']),
);

const loading = ref(false);
const deptList = ref<import('#/api/system/dept').SystemDeptApi.Dept[]>([]);

// Custom Charts
const isBuilderOpen = ref(false);
const editingChart = ref<ChartConfig | undefined>(undefined);

// Persistent storage for chart configuration
const customCharts = useStorage<ChartConfig[]>('qms-issues-custom-charts', []);

async function fetchData() {
  loading.value = true;
  try {
    const deptRes = await getDeptList();
    deptList.value = deptRes;
  } catch (error) {
    handleApiError(error, 'Fetch Issue Chart Dashboard Data');
  } finally {
    loading.value = false;
  }
}

// Drag & Drop Logic
const draggedItemIndex = ref<null | number>(null);

function handleDragStart(_event: DragEvent, index: number) {
  if (resizingState.value) {
    _event.preventDefault();
    return;
  }
  draggedItemIndex.value = index;
  if (_event.dataTransfer) {
    _event.dataTransfer.effectAllowed = 'move';
    (_event.target as HTMLElement).style.opacity = '0.5';
  }
}

function handleDragEnter(_event: DragEvent, index: number) {
  if (draggedItemIndex.value === null || draggedItemIndex.value === index)
    return;

  const items = [...customCharts.value];
  const draggedItem = items[draggedItemIndex.value];

  if (draggedItem) {
    items.splice(draggedItemIndex.value, 1);
    items.splice(index, 0, draggedItem);
    customCharts.value = items;
    draggedItemIndex.value = index;
  }
}

function handleDragEnd(_event: DragEvent) {
  draggedItemIndex.value = null;
  (_event.target as HTMLElement).style.opacity = '1';
}

function handleDrop() {}

// Resize Logic
const resizingState = ref<null | {
  id: string;
  startSpan: number;
  startX: number;
}>(null);

function handleResizeStart(event: MouseEvent, chart: ChartConfig) {
  event.preventDefault();
  event.stopPropagation();

  resizingState.value = {
    id: chart.id,
    startX: event.clientX,
    startSpan: chart.colSpan || UI_CONSTANTS.DEFAULT_CHART_COL_SPAN,
  };

  document.addEventListener('mousemove', handleResizeMove);
  document.addEventListener('mouseup', handleResizeEnd);
}

function handleResizeMove(event: MouseEvent) {
  if (!resizingState.value) return;
  const { id, startX, startSpan } = resizingState.value;

  const container = document.querySelector('.issue-chart-grid') as HTMLElement;
  if (!container) return;

  const gridWidth = container.clientWidth;
  const colWidth = gridWidth / UI_CONSTANTS.CHART_GRID_COLUMNS;

  const deltaX = event.clientX - startX;
  const deltaCols = Math.round(deltaX / colWidth);

  let newSpan = startSpan + deltaCols;
  newSpan = Math.max(
    UI_CONSTANTS.MIN_CHART_COL_SPAN,
    Math.min(UI_CONSTANTS.MAX_CHART_COL_SPAN, newSpan),
  );

  const chart = customCharts.value.find((c) => c.id === id);
  if (chart && chart.colSpan !== newSpan) {
    chart.colSpan = newSpan;
  }
}

function handleResizeEnd() {
  resizingState.value = null;
  document.removeEventListener('mousemove', handleResizeMove);
  document.removeEventListener('mouseup', handleResizeEnd);
}

onUnmounted(() => {
  document.removeEventListener('mousemove', handleResizeMove);
  document.removeEventListener('mouseup', handleResizeEnd);
});

// Chart Management
function handleAddCustomChart() {
  editingChart.value = undefined;
  isBuilderOpen.value = true;
}

function handleEditCustomChart(chart: ChartConfig) {
  editingChart.value = chart;
  isBuilderOpen.value = true;
}

function handleSaveCustomChart(config: ChartConfig) {
  const index = customCharts.value.findIndex((c) => c.id === config.id);

  if (index === -1) {
    customCharts.value.push({
      ...config,
      colSpan: UI_CONSTANTS.DEFAULT_CHART_COL_SPAN,
    });
    message.success(t('common.createSuccess'));
  } else {
    customCharts.value[index] = {
      ...customCharts.value[index],
      ...config,
    };
    message.success(t('common.saveSuccess'));
  }
}

function handleRemoveCustomChart(id: string) {
  Modal.confirm({
    title: t('common.confirmDelete'),
    content: t('common.confirmDeleteContent'),
    onOk() {
      customCharts.value = customCharts.value.filter((c) => c.id !== id);
      message.success(t('common.deleteSuccess'));
    },
  });
}

watch(
  () => [props.year, props.dateMode, props.dateValue],
  () => fetchData(),
  { immediate: true },
);

defineExpose({
  handleAddCustomChart,
});
</script>

<template>
  <div class="mb-4 flex flex-col gap-4">
    <div
      class="issue-chart-grid mt-4 grid gap-4"
      :style="{
        gridTemplateColumns: `repeat(${UI_CONSTANTS.CHART_GRID_COLUMNS}, minmax(0, 1fr))`,
      }"
      @dragover.prevent
      @drop="handleDrop"
    >
      <div
        v-for="(chart, index) in customCharts"
        :key="chart.id"
        class="group relative transition-all duration-75"
        :style="{
          gridColumn: `span ${chart.colSpan || 4} / span ${chart.colSpan || 4}`,
        }"
        draggable="true"
        @dragstart="handleDragStart($event, index)"
        @dragenter="handleDragEnter($event, index)"
        @dragend="handleDragEnd"
      >
        <Card
          :bordered="false"
          class="relative flex h-full flex-col shadow-sm transition-shadow hover:shadow-md"
          :title="chart.title"
          size="small"
          :body-style="{ flex: 1, padding: '10px' }"
        >
          <template #extra>
            <div class="flex gap-2">
              <Button
                v-if="canEdit"
                type="link"
                size="small"
                @click="handleEditCustomChart(chart)"
              >
                {{ t('common.edit') }}
              </Button>
              <Button
                v-if="canDelete"
                type="link"
                danger
                size="small"
                @click="handleRemoveCustomChart(chart.id)"
              >
                {{ t('common.delete') }}
              </Button>
            </div>
          </template>

          <div class="relative h-60 w-full cursor-move">
            <IssueCustomChartItem
              :config="chart"
              :date-mode="dateMode"
              :date-value="dateValue"
              :dept-data="deptList"
              :loading="loading"
              :year="year"
            />
          </div>

          <!-- Resize Handle -->
          <div
            class="absolute bottom-0 right-0 z-10 flex h-4 w-4 cursor-se-resize items-center justify-center rounded-tl opacity-0 transition-opacity hover:bg-gray-100 group-hover:opacity-100"
            @mousedown.stop="handleResizeStart($event, chart)"
          >
            <span
              class="i-lucide-arrow-down-right text-xs text-gray-400"
            ></span>
          </div>
        </Card>
      </div>
    </div>

    <div
      v-if="customCharts.length === 0"
      class="mt-4 rounded border border-dashed border-gray-200 bg-gray-50 py-8 text-center text-gray-400"
    >
      {{ t('common.noData') }}
    </div>

    <IssueCustomChartBuilderModal
      v-model:open="isBuilderOpen"
      :date-mode="dateMode"
      :date-value="dateValue"
      :dept-data="deptList"
      :initial-config="editingChart"
      :year="year"
      @save="handleSaveCustomChart"
    />
  </div>
</template>
