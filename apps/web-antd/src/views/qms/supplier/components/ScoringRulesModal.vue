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
    customCell: (_: unknown, index: number | undefined) => {
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
    title: '扣分规则 (基础100)',
    dataIndex: 'deduction',
    key: 'deduction',
    width: 160,
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
  // A类事故
  {
    key: 'A1',
    dimension: 'A类质量事故',
    condition: '单次发生（损失 > 5000 或严重度为 critical/fatal/p0/p1/致命）',
    deduction: '-15分/次',
    rating: '-',
    status: '-',
  },
  {
    key: 'A2',
    dimension: 'A类质量事故',
    condition: '累计 ≥ 2 次（最近12个月）',
    deduction: '总分封顶 70 分',
    rating: '建议C',
    status: 'Action',
  },
  {
    key: 'A3',
    dimension: 'A类质量事故',
    condition: '与B类合并后出现连续 3 次（且问题总数≥3）',
    deduction: '总分归零',
    rating: 'D (淘汰)',
    status: 'Frozen',
  },
  // B类事故
  {
    key: 'B1',
    dimension: 'B类质量事故',
    condition: '单次发生（严重度为 high/major/p2）',
    deduction: '-5分/次',
    rating: '-',
    status: '-',
  },
  {
    key: 'B2',
    dimension: 'B类质量事故',
    condition: '累计 ≥ 3 次（最近12个月）',
    deduction: '总分封顶 70 分',
    rating: '建议C',
    status: 'Action',
  },
  {
    key: 'B3',
    dimension: 'B类质量事故',
    condition: '与A类合并后出现连续 3 次（且问题总数≥3）',
    deduction: '总分归零',
    rating: 'D (淘汰)',
    status: 'Frozen',
  },
  // C类事故
  {
    key: 'C1',
    dimension: 'C类质量事故',
    condition: '单次发生（严重度为 low/minor/p3）',
    deduction: '-1分/次',
    rating: '-',
    status: '-',
  },
  // 进货检验
  {
    key: 'IN1',
    dimension: '进货检验',
    condition: '单批次不合格（FAIL）',
    deduction: '-3分/批',
    rating: '-',
    status: '-',
  },
  {
    key: 'IN2',
    dimension: '进货检验',
    condition: '最近12个月批次 > 5 且进货合格率 < 90%',
    deduction: '总分封顶 70 分',
    rating: '建议C',
    status: 'Action',
  },
  // 综合规则
  {
    key: 'G1',
    dimension: '综合规则',
    condition: '单次损失 > 8万（且问题总数≥3）',
    deduction: '总分归零',
    rating: 'D (淘汰)',
    status: 'Frozen',
  },
  {
    key: 'G2',
    dimension: '综合规则',
    condition: '综合分 < 75',
    deduction: '总分封顶 75 分',
    rating: '按分数映射',
    status: 'Action',
  },
  {
    key: 'G3',
    dimension: '综合规则',
    condition: '最终评级映射',
    deduction: 'A≥90, B≥80, C≥65, D<65',
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
        系统根据 **最近12个月**
        的质量记录自动计算评分与等级（基础分100，按事件扣分）。
        <br />
        <span class="text-xs text-gray-400"
          >* 外协单位与供应商适用同一套规则；冻结/观察规则优先于普通扣分。</span
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
