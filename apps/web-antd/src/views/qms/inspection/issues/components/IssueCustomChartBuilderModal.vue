<script lang="ts" setup>
import type { EchartsUIType } from '@vben/plugins/echarts';

import type { ChartConfig } from '#/components/Qms/ChartBuilder/types';
import type { DeptTreeNode } from '#/types';

import { reactive, ref, watch } from 'vue';

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

import {
  ISSUE_CHART_DIMENSIONS,
  ISSUE_CHART_METRICS,
  renderCustomChart,
} from '../composables/useIssueChartAggregation';

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

const formState = reactive<Omit<ChartConfig, 'id'>>({
  title: '自定义图表',
  dimension: 'defectType',
  metric: 'count',
  chartType: 'bar',
});

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
        Object.assign(formState, {
          title: '自定义图表',
          dimension: 'defectType',
          metric: 'count',
          chartType: 'bar',
        });
      }
    }
  },
);

const previewChartRef = ref<EchartsUIType>();
const { renderEcharts } = useEcharts(previewChartRef);

function autoGenerateTitle() {
  const dim = ISSUE_CHART_DIMENSIONS.find(
    (d) => d.value === formState.dimension,
  )?.label;
  const met = ISSUE_CHART_METRICS.find(
    (m) => m.value === formState.metric,
  )?.label;
  if (dim && met) {
    formState.title = `${dim} - ${met}分析`;
  }
}

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
      setTimeout(() => {
        void renderCustomChart(
          renderEcharts,
          { id: 'preview', ...formState },
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
    :title="initialConfig ? '编辑图表' : '添加自定义图表'"
    width="900px"
    @cancel="handleCancel"
    @ok="handleSave"
  >
    <div class="flex h-[400px] gap-4">
      <div class="flex-1 rounded border border-gray-200 bg-gray-50 p-2">
        <div class="h-full w-full">
          <EchartsUI ref="previewChartRef" height="100%" width="100%" />
        </div>
      </div>

      <div class="w-[300px] flex-shrink-0 space-y-4 pt-2">
        <Form layout="vertical">
          <FormItem label="图表标题">
            <Input v-model:value="formState.title" />
          </FormItem>

          <FormItem label="分析维度 (X轴/分类)">
            <Select
              v-model:value="formState.dimension"
              @change="handleDimensionChange"
            >
              <SelectOption
                v-for="opt in ISSUE_CHART_DIMENSIONS"
                :key="opt.value"
                :value="opt.value"
              >
                {{ opt.label }}
              </SelectOption>
            </Select>
          </FormItem>

          <FormItem label="统计指标 (Y轴/数值)">
            <Select
              v-model:value="formState.metric"
              @change="handleMetricChange"
            >
              <SelectOption
                v-for="opt in ISSUE_CHART_METRICS"
                :key="opt.value"
                :value="opt.value"
              >
                {{ opt.label }}
              </SelectOption>
            </Select>
          </FormItem>

          <FormItem label="图表类型">
            <RadioGroup
              v-model:value="formState.chartType"
              button-style="solid"
            >
              <RadioButton value="bar">柱状图</RadioButton>
              <RadioButton value="line">折线图</RadioButton>
              <RadioButton value="pie">饼图</RadioButton>
              <RadioButton value="ring">环形图</RadioButton>
            </RadioGroup>
          </FormItem>
        </Form>
      </div>
    </div>
  </Modal>
</template>
