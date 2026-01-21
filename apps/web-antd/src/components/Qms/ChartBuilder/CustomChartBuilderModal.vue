<script lang="ts" setup>
import type { EchartsUIType } from '@vben/plugins/echarts';

import type { ChartConfig, ChartOptionItem } from './types';

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

const props = defineProps<{
  dimensionOptions: ChartOptionItem[];
  getOption: (data: any[], config: ChartConfig) => any;
  initialConfig?: ChartConfig;
  metricOptions: ChartOptionItem[];
  open: boolean;
  sourceData: any[];
}>();

const emit = defineEmits<{
  save: [config: ChartConfig];
  'update:open': [boolean];
}>();

const formState = reactive<Omit<ChartConfig, 'id'>>({
  title: '自定义图表',
  dimension: props.dimensionOptions[0]?.value || '',
  metric: props.metricOptions[0]?.value || '',
  chartType: 'bar',
});

// 预览图表 Ref
const previewChartRef = ref<EchartsUIType>();
const { renderEcharts } = useEcharts(previewChartRef);

// 生成标题的辅助函数
function autoGenerateTitle() {
  const dim = props.dimensionOptions.find(
    (d) => d.value === formState.dimension,
  )?.label;
  const met = props.metricOptions.find(
    (m) => m.value === formState.metric,
  )?.label;
  if (dim && met) {
    formState.title = `${dim} - ${met}分析`;
  }
}

function renderPreview() {
  const option = props.getOption(props.sourceData, {
    id: 'preview',
    ...formState,
  });
  if (option) {
    renderEcharts(option as any);
  }
}

// 监听配置变化，实时渲染预览
watch(
  [
    () => formState.dimension,
    () => formState.metric,
    () => formState.chartType,
    () => props.open,
  ],
  () => {
    if (props.open) {
      setTimeout(() => {
        renderPreview();
      }, 100);
    }
  },
  { deep: true },
);

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
        // Reset to defaults
        Object.assign(formState, {
          title: '自定义图表',
          dimension: props.dimensionOptions[0]?.value || '',
          metric: props.metricOptions[0]?.value || '',
          chartType: 'bar',
        });
      }
      setTimeout(renderPreview, 100);
    }
  },
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
      <!-- 左侧：预览区域 -->
      <div class="flex-1 rounded border border-gray-200 bg-gray-50 p-2">
        <div class="h-full w-full">
          <EchartsUI ref="previewChartRef" height="100%" width="100%" />
        </div>
      </div>

      <!-- 右侧：配置区域 -->
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
                v-for="opt in dimensionOptions"
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
                v-for="opt in metricOptions"
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
