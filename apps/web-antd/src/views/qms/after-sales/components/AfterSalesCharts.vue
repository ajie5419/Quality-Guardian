<script lang="ts" setup>
import type { ChartConfig } from '../composables/useChartAggregation';

import type { QmsAfterSalesApi } from '#/api/qms/after-sales';
import type { DeptTreeNode } from '#/types';

import { computed, onUnmounted, ref, watch } from 'vue';

import { useAccess } from '@vben/access';
import { useI18n } from '@vben/locales';

import { Button, Card, message, Modal } from 'ant-design-vue';

import { getAfterSalesList } from '#/api/qms/after-sales';
import { getDeptList } from '#/api/system/dept';

import { CHART_DIMENSIONS, CHART_METRICS } from '../constants';
import CustomChartBuilderModal from './CustomChartBuilderModal.vue';
import CustomChartItem from './CustomChartItem.vue';

const props = defineProps<{
  refreshKey?: number;
  year?: number;
}>();

const customCharts = defineModel<ChartConfig[]>('charts', { default: () => [] });

const { hasAccessByCodes } = useAccess();
const { t } = useI18n();
const canAdd = computed(() => hasAccessByCodes(['QMS:AfterSales:ChartAdd']));
const canEdit = computed(() => hasAccessByCodes(['QMS:AfterSales:ChartEdit']));
const canDelete = computed(() =>
  hasAccessByCodes(['QMS:AfterSales:ChartDelete']),
);

const loading = ref(false);

// 全量列表数据，用于自定义图表计算
const fullDataList = ref<QmsAfterSalesApi.AfterSalesItem[]>([]);
const deptList = ref<DeptTreeNode[]>([]);

// Custom Charts
const isBuilderOpen = ref(false);
const editingChart = ref<ChartConfig | undefined>(undefined);

async function fetchData() {
  loading.value = true;
  try {
    // 获取全量数据用于自定义分析，pageSize 设大一点
    const [listRes, deptRes] = await Promise.all([
      getAfterSalesList({
        year: props.year,
        pageSize: 10_000,
      } as QmsAfterSalesApi.AfterSalesParams),
      getDeptList(),
    ]);
    fullDataList.value = listRes;
    deptList.value = deptRes;
  } catch (error) {
    console.error('Failed to fetch after-sales data:', error);
  } finally {
    loading.value = false;
  }
}

// 拖拽逻辑 (Drag & Drop)
const draggedItemIndex = ref<null | number>(null);

function handleDragStart(_event: DragEvent, index: number) {
  // Prevent dragging if resizing
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

// 调整大小逻辑 (Mouse Resize)
const resizingState = ref<null | {
  id: string;
  startSpan: number;
  startX: number;
}>(null);

function handleResizeStart(event: MouseEvent, chart: ChartConfig) {
  event.preventDefault(); // Prevent text selection
  event.stopPropagation(); // Prevent drag start

  resizingState.value = {
    id: chart.id,
    startX: event.clientX,
    startSpan: chart.colSpan || 4,
  };

  document.addEventListener('mousemove', handleResizeMove);
  document.addEventListener('mouseup', handleResizeEnd);
}

function handleResizeMove(event: MouseEvent) {
  if (!resizingState.value) return;
  const { id, startX, startSpan } = resizingState.value;

  const container = document.querySelector('.custom-chart-grid') as HTMLElement;
  if (!container) return;

  // Calculate column width (container width / 12)
  // Minus gap? Approximate is usually fine for snapping
  const gridWidth = container.clientWidth;
  const colWidth = gridWidth / 12;

  const deltaX = event.clientX - startX;
  const deltaCols = Math.round(deltaX / colWidth);

  let newSpan = startSpan + deltaCols;
  // Min 3 columns (1/4), Max 12 columns (Full)
  newSpan = Math.max(3, Math.min(12, newSpan));

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
    // Create new
    customCharts.value.push({ ...config, colSpan: 4 });
    message.success(t('common.addSuccess'));
  } else {
    // Update existing
    customCharts.value[index] = {
      ...customCharts.value[index],
      ...config,
    };
    message.success(t('common.updateSuccess'));
  }
}

function handleRemoveCustomChart(id: string) {
  Modal.confirm({
    title: t('common.confirmDelete'),
    content: t('qms.afterSales.chart.confirmDelete'),
    onOk() {
      customCharts.value = customCharts.value.filter((c) => c.id !== id);
      message.success(t('common.deleteSuccess'));
    },
  });
}

// Watch for year or refreshKey changes
watch(
  () => [props.year, props.refreshKey],
  () => fetchData(),
  { immediate: true },
);

defineExpose({
  handleAddCustomChart,
});
</script>

<template>
  <div class="mb-4 flex flex-col gap-4">
    <!-- 4. Custom Charts Section -->
    <div class="flex items-center justify-end border-b pb-2">
      <Button
        v-if="canAdd"
        type="dashed"
        size="small"
        @click="handleAddCustomChart"
      >
        <span class="i-lucide-plus mr-1"></span
        >{{ t('qms.afterSales.chart.add') }}
      </Button>
    </div>

    <!-- 可拖拽区域 -->
    <div
      class="custom-chart-grid mt-4 grid gap-4"
      style="grid-template-columns: repeat(12, minmax(0, 1fr))"
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
                {{ t('common.settings') }}
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
            <CustomChartItem
              :config="chart"
              :data="fullDataList"
              :loading="loading"
              :dept-data="deptList"
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
      {{ t('qms.afterSales.chart.empty') }}
    </div>

    <CustomChartBuilderModal
      v-model:open="isBuilderOpen"
      :source-data="fullDataList"
      :initial-config="editingChart"
      :dept-data="deptList"
      :dimension-options="CHART_DIMENSIONS"
      :metric-options="CHART_METRICS"
      @save="handleSaveCustomChart"
    />
  </div>
</template>
