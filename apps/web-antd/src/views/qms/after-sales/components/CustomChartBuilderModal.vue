<script lang="ts" setup>
import type { EchartsUIType } from '@vben/plugins/echarts';

import type { ChartConfig } from '../composables/useChartAggregation';

import type { DeptTreeNode } from '#/types';

import { reactive, ref, watch } from 'vue';

import { useI18n } from '@vben/locales';
// ... (abbreviated, actually I should include context to be safe)
import { EchartsUI, useEcharts } from '@vben/plugins/echarts';

import {
  Form,
  FormItem,
  Input,
  Modal,
  RadioButton,
  RadioGroup,
  Select,
  SelectOption,
} from 'ant-design-vue';

import { renderCustomChart } from '../composables/useChartAggregation';
import { CHART_DIMENSIONS, CHART_METRICS } from '../constants';

const props = defineProps<{
  dateMode?: 'month' | 'week' | 'year';
  dateValue?: string;
  deptData?: DeptTreeNode[];
  initialConfig?: ChartConfig;
  open: boolean;
  year?: number;
}>();

const emit = defineEmits<{
  save: [config: ChartConfig];
  'update:open': [boolean];
}>();

const { t } = useI18n();

const formState = reactive<Omit<ChartConfig, 'id'>>({
  title: t('qms.afterSales.chart.defaultTitle'),
  dimension: 'defectType',
  metric: 'count',
  chartType: 'bar',
});

// Watch for open and initialConfig changes to populate form
watch(
  () => props.open,
  (val) => {
    if (val) {
      if (props.initialConfig) {
        Object.assign(formState, {
          title: props.initialConfig.title,
          dimension: props.initialConfig.dimension,
          metric: props.initialConfig.metric,
          chartType: props.initialConfig.chartType,
        });
      } else {
        // Reset to defaults for new chart
        Object.assign(formState, {
          title: t('qms.afterSales.chart.defaultTitle'),
          dimension: 'defectType',
          metric: 'count',
          chartType: 'bar',
        });
      }
    }
  },
);

// 预览图表 Ref
const previewChartRef = ref<EchartsUIType>();
const { renderEcharts } = useEcharts(previewChartRef);

// 生成标题的辅助函数
function autoGenerateTitle() {
  const dim = CHART_DIMENSIONS.find(
    (d) => d.value === formState.dimension,
  )?.label;
  const met = CHART_METRICS.find((m) => m.value === formState.metric)?.label;
  if (dim && met) {
    formState.title = t('qms.afterSales.chart.autoTitle', [t(dim), t(met)]);
  }
}

// 监听配置变化，实时渲染预览
watch(
  [
    () => formState.dimension,
    () => formState.metric,
    () => formState.chartType,
    () => props.open,
    () => props.dateMode,
    () => props.dateValue,
    () => props.year,
  ],
  () => {
    if (props.open) {
      // 简单防抖或直接调用
      setTimeout(() => {
        renderCustomChart(
          renderEcharts,
          { id: 'preview', ...formState },
          t,
          {
            dateMode: props.dateMode,
            dateValue: props.dateValue,
            year: props.year,
          },
          props.deptData,
        );
      }, 100);
    }
  },
  { deep: true },
);

function handleDimensionChange() {
  autoGenerateTitle();
}

function handleMetricChange() {
  autoGenerateTitle();
}

function handleSave() {
  emit('save', {
    id: props.initialConfig?.id || `custom_${Date.now()}`,
    ...formState,
  });
  emit('update:open', false);
}

function handleCancel() {
  emit('update:open', false);
}
</script>

<template>
  <Modal
    :open="open"
    :title="
      initialConfig
        ? t('qms.afterSales.chart.editTitle')
        : t('qms.afterSales.chart.addTitle')
    "
    width="900px"
    @cancel="handleCancel"
    @ok="handleSave"
  >
    <div class="flex h-[400px] gap-4">
      <!-- 左侧：预览区域 -->
      <div class="flex-1 rounded border border-gray-200 bg-gray-50 p-2">
        <div class="h-full w-full">
          <EchartsUI ref="previewChartRef" height="100%" width="100%" />
        </div>
      </div>

      <!-- 右侧：配置区域 -->
      <div class="w-[300px] flex-shrink-0 space-y-4 pt-2">
        <Form layout="vertical">
          <FormItem :label="t('qms.afterSales.chart.form.title')">
            <Input v-model:value="formState.title" />
          </FormItem>

          <FormItem :label="t('qms.afterSales.chart.form.dimension')">
            <Select
              v-model:value="formState.dimension"
              @change="handleDimensionChange"
            >
              <SelectOption
                v-for="opt in CHART_DIMENSIONS"
                :key="opt.value"
                :value="opt.value"
              >
                {{ t(opt.label) }}
              </SelectOption>
            </Select>
          </FormItem>

          <FormItem :label="t('qms.afterSales.chart.form.metric')">
            <Select
              v-model:value="formState.metric"
              @change="handleMetricChange"
            >
              <SelectOption
                v-for="opt in CHART_METRICS"
                :key="opt.value"
                :value="opt.value"
              >
                {{ t(opt.label) }}
              </SelectOption>
            </Select>
          </FormItem>

          <FormItem :label="t('qms.afterSales.chart.form.chartType')">
            <RadioGroup
              v-model:value="formState.chartType"
              button-style="solid"
            >
              <RadioButton value="bar">{{
                t('qms.afterSales.chart.type.bar')
              }}</RadioButton>
              <RadioButton value="line">{{
                t('qms.afterSales.chart.type.line')
              }}</RadioButton>
              <RadioButton value="pie">{{
                t('qms.afterSales.chart.type.pie')
              }}</RadioButton>
              <RadioButton value="ring">{{
                t('qms.afterSales.chart.type.ring')
              }}</RadioButton>
            </RadioGroup>
          </FormItem>
        </Form>
      </div>
    </div>
  </Modal>
</template>
