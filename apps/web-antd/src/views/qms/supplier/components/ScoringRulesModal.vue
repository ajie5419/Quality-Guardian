<script lang="ts" setup>
import { ref } from 'vue';

import { Modal, Table, Tag } from 'ant-design-vue';

defineProps<{
  // category?: string; // If we need to distinguish rules later
}>();
const open = ref(false);
// const { t: _t } = useI18n(); // Removed unused variable

const columns = [
  {
    title: '评价维度',
    dataIndex: 'dimension',
    key: 'dimension',
    width: 120,
    customCell: (_: any, index: number | undefined) => {
      if (index === 0) return { rowSpan: 3 };
      if (index === 1 || index === 2) return { rowSpan: 0 };
      if (index === 3) return { rowSpan: 3 };
      if (index === 4 || index === 5) return { rowSpan: 0 };
      if (index === 6) return { rowSpan: 1 };
      if (index === 7) return { rowSpan: 2 };
      if (index === 8) return { rowSpan: 0 };
      return { rowSpan: 1 };
    },
  },
  {
    title: '触发条件 (12个月内)',
    dataIndex: 'condition',
    key: 'condition',
  },
  {
    title: '扣分 (基础100)',
    dataIndex: 'deduction',
    key: 'deduction',
    width: 120,
  },
  {
    title: '评级影响',
    dataIndex: 'rating',
    key: 'rating',
    width: 100,
  },
  {
    title: '状态影响',
    dataIndex: 'status',
    key: 'status',
    width: 100,
  },
];

const data = [
  // A类
  {
    key: 'A1',
    dimension: 'A类质量事故',
    condition: '连续 3 次 或 单次损失 > 8万',
    deduction: '0分',
    rating: 'D (淘汰)',
    status: 'Frozen',
  },
  {
    key: 'A2',
    dimension: 'A类质量事故',
    condition: '累计 2 次',
    deduction: '封顶 70分',
    rating: 'C (降级)',
    status: 'Action',
  },
  {
    key: 'A3',
    dimension: 'A类质量事故',
    condition: '单次发生 (损失>5000 或 致命缺陷)',
    deduction: '-15分/次',
    rating: 'B',
    status: '-',
  },
  // B类
  {
    key: 'B1',
    dimension: 'B类质量事故',
    condition: '连续 3 次',
    deduction: '0分',
    rating: 'D (淘汰)',
    status: 'Frozen',
  },
  {
    key: 'B2',
    dimension: 'B类质量事故',
    condition: '累计 3 次',
    deduction: '封顶 70分',
    rating: 'C (降级)',
    status: 'Action',
  },
  {
    key: 'B3',
    dimension: 'B类质量事故',
    condition: '单次发生 (严重程度: Major)',
    deduction: '-5分/次',
    rating: 'B',
    status: '-',
  },
  // C类
  {
    key: 'C1',
    dimension: 'C类质量事故',
    condition: '单次发生 (严重程度: Minor)',
    deduction: '-1分/次',
    rating: '-',
    status: '-',
  },
  // 进货
  {
    key: 'IN1',
    dimension: '进货检验',
    condition: '批次合格率 < 90% (且批数>5)',
    deduction: '按批扣分',
    rating: 'C (降级)',
    status: 'Action',
  },
  {
    key: 'IN2',
    dimension: '进货检验',
    condition: '单批次不合格 (FAIL)',
    deduction: '-3分/批',
    rating: '-',
    status: '-',
  },
];

function openModal() {
  open.value = true;
}

defineExpose({ openModal });
</script>

<template>
  <Modal
    v-model:open="open"
    :footer="null"
    title="供应商动态评分与降级规则"
    width="800px"
  >
    <div class="mb-4 text-gray-500">
      <p>
        系统根据 **最近12个月** 的质量记录自动计算评分与等级。
        <br />
        <span class="text-xs text-gray-400"
          >*
          外协单位与供应商适用同一套评价标准。进货检验权重较低，主要关注售后/工程质量事故。</span
        >
      </p>
    </div>

    <Table
      :columns="columns"
      :data-source="data"
      :pagination="false"
      bordered
      row-key="key"
      size="small"
    >
      <template #bodyCell="params">
        <template v-if="params.column.dataIndex === 'dimension'">
          <!-- Dimension handled by customRender/rowSpan logic in columns prop or handleBodyCell -->
          <!-- Wait, AntDV Table customRender is in column definition. Let's use bodyCell for spans. -->
          <strong>{{ params.text }}</strong>
        </template>
        <template v-else-if="params.column.dataIndex === 'status'">
          <Tag v-if="params.text === 'Frozen'" color="error">冻结/淘汰</Tag>
          <Tag v-else-if="params.text === 'Action'" color="warning"
            >观察/降级</Tag
          >
          <span v-else class="text-gray-400">-</span>
        </template>
        <template v-else-if="params.column.dataIndex === 'rating'">
          <Tag v-if="params.text.includes('D')" color="red">D级</Tag>
          <Tag v-else-if="params.text.includes('C')" color="orange">C级</Tag>
          <Tag v-else-if="params.text === 'B'" color="blue">B级</Tag>
          <span v-else>{{ params.text }}</span>
        </template>
      </template>
    </Table>
  </Modal>
</template>
