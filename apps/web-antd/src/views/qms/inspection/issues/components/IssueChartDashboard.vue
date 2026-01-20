<script lang="ts" setup>
import type { InspectionIssue, DeptNode } from '../types';
import type { ChartConfig } from '#/components/Qms/ChartBuilder/types';

import { onUnmounted, ref, watch } from 'vue';

import { useStorage } from '@vueuse/core';
import { Button, Card, message, Modal } from 'ant-design-vue';

import { useI18n } from '@vben/locales';

import { getInspectionIssues } from '#/api/qms/inspection';
import { getDeptList } from '#/api/system/dept';
import {
  CustomChartBuilderModal,
  CustomChartItem,
} from '#/components/Qms/ChartBuilder';

import {
  getIssueChartOption,
  ISSUE_CHART_DIMENSIONS,
  ISSUE_CHART_METRICS,
} from '../composables/useIssueChartAggregation';
import { UI_CONSTANTS } from '../constants';

const props = defineProps<{
  year?: number;
}>();

const { t } = useI18n();

const loading = ref(false);
const fullDataList = ref<InspectionIssue[]>([]);
const deptList = ref<DeptNode[]>([]);

// Custom Charts
const isBuilderOpen = ref(false);
const editingChart = ref<ChartConfig | undefined>(undefined);

// Persistent storage for chart configuration
const customCharts = useStorage<ChartConfig[]>('qms-issues-custom-charts', []);

async function fetchData() {
  loading.value = true;
  try {
    const [res, deptRes] = await Promise.all([
      getInspectionIssues({ year: props.year, pageSize: 10000 } as any),
      getDeptList(),
    ]);
    // Ensure we have an array (API might return { items: [] } or just [])
    fullDataList.value = Array.isArray(res) ? res : (res as any).items || [];
    deptList.value = deptRes;
  } catch (error) {
    console.error('Failed to fetch inspection issues:', error);
  } finally {
    loading.value = false;
  }
}

// 包装 getOption 函数，注入 deptList
function getOptionWithDept(data: any[], config: ChartConfig) {
  return getIssueChartOption(data, config, deptList.value);
}

// Drag & Drop Logic
const draggedItemIndex = ref<number | null>(null);

function handleDragStart(event: DragEvent, index: number) {
  if (resizingState.value) {
    event.preventDefault();
    return;
  }
  draggedItemIndex.value = index;
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    (event.target as HTMLElement).style.opacity = '0.5';
  }
}

function handleDragEnter(event: DragEvent, index: number) {
  if (draggedItemIndex.value === null || draggedItemIndex.value === index) return;
  
  const items = [...customCharts.value];
  const draggedItem = items[draggedItemIndex.value];
  
  if (draggedItem) {
    items.splice(draggedItemIndex.value, 1);
    items.splice(index, 0, draggedItem);
    customCharts.value = items;
    draggedItemIndex.value = index;
  }
}

function handleDragEnd(event: DragEvent) {
  draggedItemIndex.value = null;
  (event.target as HTMLElement).style.opacity = '1';
}

function handleDrop() {}

// Resize Logic
const resizingState = ref<{
  id: string;
  startX: number;
  startSpan: number;
} | null>(null);

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
  newSpan = Math.max(UI_CONSTANTS.MIN_CHART_COL_SPAN, Math.min(UI_CONSTANTS.MAX_CHART_COL_SPAN, newSpan));

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

  if (index !== -1) {
    customCharts.value[index] = {
      ...customCharts.value[index],
      ...config,
    };
    message.success(t('common.saveSuccess'));
  } else {
    customCharts.value.push({ ...config, colSpan: UI_CONSTANTS.DEFAULT_CHART_COL_SPAN });
    message.success(t('common.createSuccess'));
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

watch(() => props.year, () => fetchData(), { immediate: true });
</script>

<template>
  <div class="mb-4 flex flex-col gap-4">
    <div class="flex items-center justify-end border-b pb-2">
      <Button type="dashed" size="small" @click="handleAddCustomChart">
        <span class="i-lucide-plus mr-1"></span>{{ t('common.create') }}
      </Button>
    </div>

    <div
      class="mt-4 grid gap-4 issue-chart-grid"
      :style="{
        gridTemplateColumns: `repeat(${UI_CONSTANTS.CHART_GRID_COLUMNS}, minmax(0, 1fr))`
      }"
      @dragover.prevent
      @drop="handleDrop"
    >
      <div
        v-for="(chart, index) in customCharts"
        :key="chart.id"
        class="transition-all duration-75 relative group"
        :style="{
          gridColumn: `span ${chart.colSpan || 4} / span ${chart.colSpan || 4}`
        }"
        draggable="true"
        @dragstart="handleDragStart($event, index)"
        @dragenter="handleDragEnter($event, index)"
        @dragend="handleDragEnd"
      >
        <Card
          :bordered="false"
          class="shadow-sm hover:shadow-md transition-shadow relative h-full flex flex-col"
          :title="chart.title"
          size="small"
          :body-style="{ flex: 1, padding: '10px' }"
        >
          <template #extra>
            <div class="flex gap-2">
              <Button
                type="link"
                size="small"
                @click="handleEditCustomChart(chart)"
              >
                {{ t('common.edit') }}
              </Button>
              <Button
                type="link"
                danger
                size="small"
                @click="handleRemoveCustomChart(chart.id)"
              >
                {{ t('common.delete') }}
              </Button>
            </div>
          </template>
          
          <div class="h-60 w-full relative cursor-move">
            <CustomChartItem
              :config="chart"
              :data="fullDataList"
              :loading="loading"
              :get-option="getOptionWithDept"
            />
          </div>
          
          <!-- Resize Handle -->
          <div
            class="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize opacity-0 group-hover:opacity-100 hover:bg-gray-100 rounded-tl transition-opacity z-10 flex items-center justify-center"
            @mousedown.stop="handleResizeStart($event, chart)"
          >
            <span class="i-lucide-arrow-down-right text-gray-400 text-xs"></span>
          </div>
        </Card>
      </div>
    </div>
    
    <div v-if="customCharts.length === 0" class="text-center py-8 text-gray-400 bg-gray-50 rounded border border-dashed border-gray-200 mt-4">
      {{ t('common.noData') }}
    </div>

    <CustomChartBuilderModal
      v-model:open="isBuilderOpen"
      :source-data="fullDataList"
      :initial-config="editingChart"
      :dimension-options="ISSUE_CHART_DIMENSIONS"
      :metric-options="ISSUE_CHART_METRICS"
      :get-option="getOptionWithDept"
      @save="handleSaveCustomChart"
    />
  </div>
</template>
