<script lang="ts" setup>
import type { WeeklyReportData } from '#/api/qms/reports-weekly';

import { ref, watch } from 'vue';

import { Input, message, Table } from 'ant-design-vue';

import { getWeeklyReport } from '#/api/qms/reports-weekly';

const props = defineProps<{
  endDate: string;
  startDate: string;
}>();

// State
const loading = ref(false);
const reportData = ref<WeeklyReportData>({
  title: 'Weekly Quality Report',
  period: '',
  author: { name: '', dept: '', role: '', leader: '' },
  trackingIssues: [],
  internalIssues: [],
  externalIssues: [],
  weeklyPlan: [
    { goal: 'O1 强化质量管理', content: '', progress: '', remarks: '' },
    { goal: 'O4 预防性质量管理', content: '', progress: '', remarks: '' },
    { goal: 'O5 部门管理', content: '', progress: '', remarks: '' },
  ],
});

// Columns
const trackingColumns = [
  { title: '问题类型', dataIndex: 'type', key: 'type', width: 100 },
  { title: '问题点', dataIndex: 'description', key: 'description' },
  { title: '目前处理进度情况', dataIndex: 'progress', key: 'progress' },
  {
    title: '完成时间',
    dataIndex: 'completionTime',
    key: 'completionTime',
    width: 120,
  },
  { title: '责任部门', dataIndex: 'respDept', key: 'respDept', width: 120 },
  { title: '备注', dataIndex: 'remarks', key: 'remarks', width: 150 },
];

const issueColumns = [
  { title: '项目名称', dataIndex: 'product', key: 'product', width: 150 },
  { title: '问题描述', dataIndex: 'description', key: 'description' },
  { title: '责任部门', dataIndex: 'respDept', key: 'respDept', width: 100 },
  { title: '问题等级', dataIndex: 'level', key: 'level', width: 100 },
  { title: '问题原因', dataIndex: 'cause', key: 'cause' },
  { title: '处理措施', dataIndex: 'measures', key: 'measures' },
  { title: '关闭时间', dataIndex: 'closeTime', key: 'closeTime', width: 120 },
];

const planColumns = [
  { title: '目标', dataIndex: 'goal', key: 'goal', width: 150 },
  { title: '内容', dataIndex: 'content', key: 'content' }, // Editable
  { title: '进度', dataIndex: 'progress', key: 'progress' }, // Editable
  { title: '备注', dataIndex: 'remarks', key: 'remarks' }, // Editable
];

// Methods
async function loadData() {
  if (!props.startDate || !props.endDate) return;

  loading.value = true;
  try {
    const data = await getWeeklyReport({
      startDate: props.startDate,
      endDate: props.endDate,
    });

    reportData.value.title = data.title;
    reportData.value.period = data.period;
    reportData.value.author = data.author;
    reportData.value.trackingIssues = data.trackingIssues;
    reportData.value.internalIssues = data.internalIssues;
    reportData.value.externalIssues = data.externalIssues;

    if (data.weeklyPlan && data.weeklyPlan.length > 0) {
      reportData.value.weeklyPlan = data.weeklyPlan;
    }
  } catch {
    message.error('加载报表数据失败');
  } finally {
    loading.value = false;
  }
}

watch(
  () => [props.startDate, props.endDate],
  () => {
    loadData();
  },
  { immediate: true },
);

// Expose report data for parent to update header
// Helper for template access
function getRecordValue(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === 'string' ? value : '';
}

function setRecordValue(
  record: Record<string, unknown>,
  key: string,
  value: string,
) {
  record[key] = value;
}

defineExpose({
  reportData,
});
</script>

<template>
  <div class="space-y-6" id="weekly-report-container">
    <!-- Content only, Header is in parent -->

    <!-- Section 1: Tracking -->
    <div>
      <h2 class="mb-4 border-l-4 border-blue-500 pl-2 text-xl font-bold">
        1. 上周问题跟踪情况
      </h2>
      <Table
        :columns="trackingColumns"
        :data-source="reportData.trackingIssues"
        :pagination="false"
        bordered
        size="small"
        row-key="id"
      />
    </div>

    <!-- Section 2: Internal Issues -->
    <div>
      <h2 class="mb-4 border-l-4 border-blue-500 pl-2 text-xl font-bold">
        2. 厂内重点质量问题
      </h2>
      <Table
        :columns="issueColumns"
        :data-source="reportData.internalIssues"
        :pagination="false"
        bordered
        size="small"
        row-key="description"
      />
    </div>

    <!-- Section 3: External Issues -->
    <div>
      <h2 class="mb-4 border-l-4 border-red-500 pl-2 text-xl font-bold">
        3. 厂外重点质量问题
      </h2>
      <Table
        :columns="issueColumns"
        :data-source="reportData.externalIssues"
        :pagination="false"
        bordered
        size="small"
        row-key="description"
      />
    </div>

    <!-- Section 4: Weekly Plan -->
    <div>
      <h2 class="mb-4 border-l-4 border-green-500 pl-2 text-xl font-bold">
        4. 本周计划
      </h2>
      <Table
        :columns="planColumns"
        :data-source="reportData.weeklyPlan"
        :pagination="false"
        bordered
        size="small"
        row-key="goal"
      >
        <template #bodyCell="{ column, record }">
          <template
            v-if="
              ['content', 'progress', 'remarks'].includes(column.key as string)
            "
          >
            <Input.TextArea
              :value="getRecordValue(record, column.key as string)"
              @update:value="
                (val: string) =>
                  setRecordValue(record, column.key as string, val)
              "
              :auto-size="{ minRows: 2, maxRows: 6 }"
              :bordered="false"
            />
          </template>
        </template>
      </Table>
    </div>
  </div>
</template>

<style scoped>
:deep(.ant-table-thead > tr > th) {
  font-weight: bold;
  background-color: #f0f2f5;
}
</style>
