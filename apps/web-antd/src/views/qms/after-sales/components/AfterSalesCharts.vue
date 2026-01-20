<script lang="ts" setup>
import {
  getAfterSalesChartOption,
  type ChartConfig,
} from '../composables/useChartAggregation';

import { onMounted, onUnmounted, ref, watch } from 'vue';

import { useStorage } from '@vueuse/core';
import { Button, Card, message, Modal } from 'ant-design-vue';

import {
  getAfterSalesList,
  type QmsAfterSalesApi,
} from '#/api/qms/after-sales';
import { getDeptList } from '#/api/system/dept';

import { CHART_DIMENSIONS, CHART_METRICS } from '../constants';
import CustomChartBuilderModal from './CustomChartBuilderModal.vue';
import CustomChartItem from './CustomChartItem.vue';

const props = defineProps<{
  year?: number;
  refreshKey?: number;
}>();

const loading = ref(false);

// 全量列表数据，用于自定义图表计算
const fullDataList = ref<QmsAfterSalesApi.AfterSalesItem[]>([]);
const deptList = ref<any[]>([]);

// Custom Charts
const isBuilderOpen = ref(false);
const editingChart = ref<ChartConfig | undefined>(undefined);

// 持久化存储自定义图表配置
const customCharts = useStorage<ChartConfig[]>('qms-after-sales-custom-charts', []);

async function fetchData() {
  loading.value = true;
  try {
    // 获取全量数据用于自定义分析，pageSize 设大一点
    const [listRes, deptRes] = await Promise.all([
      getAfterSalesList({ year: props.year, pageSize: 10000 } as any),
      getDeptList()
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
const draggedItemIndex = ref<number | null>(null);

function handleDragStart(event: DragEvent, index: number) {
  // Prevent dragging if resizing
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

// 调整大小逻辑 (Mouse Resize)
const resizingState = ref<{
  id: string;
  startX: number;
  startSpan: number;
} | null>(null);

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
  
  if (index !== -1) {
    // Update existing
    customCharts.value[index] = { 
      ...customCharts.value[index], 
      ...config 
    };
    message.success('图表已更新');
  } else {
    // Create new
    customCharts.value.push({ ...config, colSpan: 4 });
    message.success('图表添加成功');
  }
}

function handleRemoveCustomChart(id: string) {
  Modal.confirm({
    title: '确认删除',
    content: '确定要删除此图表吗？',
    onOk() {
      customCharts.value = customCharts.value.filter((c) => c.id !== id);
      message.success('删除成功');
    },
  });
}

// Watch for year or refreshKey changes
watch(() => [props.year, props.refreshKey], () => fetchData(), { immediate: true });
</script>

<template>
  <div class="mb-4 flex flex-col gap-4">
    <!-- 4. Custom Charts Section -->
    <div class="flex items-center justify-end border-b pb-2">
      <Button type="dashed" size="small" @click="handleAddCustomChart">
        <span class="i-lucide-plus mr-1"></span>添加图表
      </Button>
    </div>

    <!-- 可拖拽区域 -->
    <div
      class="mt-4 grid gap-4 custom-chart-grid"
      style="grid-template-columns: repeat(12, minmax(0, 1fr));"
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
                设置
              </Button>
              <Button
                type="link"
                danger
                size="small"
                @click="handleRemoveCustomChart(chart.id)"
              >
                删除
              </Button>
            </div>
          </template>
          <div class="h-60 w-full relative cursor-move">
            <CustomChartItem
              :config="chart"
              :data="fullDataList"
              :loading="loading"
              :dept-data="deptList"
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
      暂无自定义图表，点击上方按钮添加
    </div>

    <CustomChartBuilderModal
      v-model:open="isBuilderOpen"
      :source-data="fullDataList"
      :initial-config="editingChart"
      :dept-data="deptList"
      :dimension-options="CHART_DIMENSIONS"
      :metric-options="CHART_METRICS"
      :get-option="getAfterSalesChartOption"
      @save="handleSaveCustomChart"
    />
  </div>
</template>
