<script lang="ts" setup>
import type { PaginationProps, TableColumnType } from 'ant-design-vue';

import type { WorkOrderRequirementBoardFilter } from '#/api/qms/work-order';

import { computed } from 'vue';

import { Button, Drawer, Table, Tag } from 'ant-design-vue';

const props = defineProps<{
  filter: WorkOrderRequirementBoardFilter;
  items: Array<{
    attachments: Array<{
      name?: string;
      thumbUrl?: string;
      type?: string;
      url: string;
    }>;
    confirmedAt?: null | string;
    confirmer: string;
    confirmStatus: 'CONFIRMED' | 'PENDING';
    createdAt: string;
    customerName: string;
    division: string;
    id: string;
    partName: string;
    processName: string;
    projectName: string;
    requirementName: string;
    responsiblePerson: string;
    responsibleTeam: string;
    workOrderNumber: string;
    workOrderStatus: string;
  }>;
  loading: boolean;
  open: boolean;
  pagination: PaginationProps;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'openWorkOrder', workOrderNumber: string): void;
  (e: 'pageChange', page: number, pageSize: number): void;
}>();

const title = computed(() => {
  if (props.filter === 'confirmed') return '已完成任务';
  if (props.filter === 'pending') return '未完成任务';
  if (props.filter === 'overdue') return '超10天未关注任务';
  return '全部任务';
});

const columns = computed<TableColumnType[]>(() => [
  {
    title: '工单号',
    dataIndex: 'workOrderNumber',
    key: 'workOrderNumber',
    width: 140,
    fixed: 'left',
  },
  {
    title: '项目名称',
    dataIndex: 'projectName',
    key: 'projectName',
    width: 160,
    ellipsis: true,
  },
  {
    title: '要求内容',
    dataIndex: 'requirementName',
    key: 'requirementName',
    width: 220,
    ellipsis: true,
  },
  {
    title: '部件',
    dataIndex: 'partName',
    key: 'partName',
    width: 120,
    ellipsis: true,
  },
  {
    title: '工序',
    dataIndex: 'processName',
    key: 'processName',
    width: 120,
    ellipsis: true,
  },
  {
    title: '责任班组',
    dataIndex: 'responsibleTeam',
    key: 'responsibleTeam',
    width: 140,
    ellipsis: true,
  },
  {
    title: '责任人',
    dataIndex: 'responsiblePerson',
    key: 'responsiblePerson',
    width: 100,
    ellipsis: true,
  },
  { title: '下发时间', dataIndex: 'createdAt', key: 'createdAt', width: 120 },
  { title: '状态', key: 'confirmStatus', width: 100 },
  {
    title: '确认人',
    dataIndex: 'confirmer',
    key: 'confirmer',
    width: 100,
    ellipsis: true,
  },
  {
    title: '完成时间',
    dataIndex: 'confirmedAt',
    key: 'confirmedAt',
    width: 180,
  },
]);

function formatDate(value?: null | string) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('zh-CN');
}

function formatDateTime(value?: null | string) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', { hour12: false });
}
</script>

<template>
  <Drawer :open="open" :title="title" width="1280" @close="emit('close')">
    <Table
      size="middle"
      :columns="columns"
      :data-source="items"
      :loading="loading"
      :pagination="{
        current: pagination.current,
        pageSize: pagination.pageSize,
        total: pagination.total,
        showSizeChanger: true,
      }"
      :row-key="(record) => record.id"
      :scroll="{ x: 1500 }"
      @change="
        (page) =>
          emit(
            'pageChange',
            Number(page.current || 1),
            Number(page.pageSize || 20),
          )
      "
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'workOrderNumber'">
          <Button
            type="link"
            class="!px-0"
            @click="emit('openWorkOrder', record.workOrderNumber)"
          >
            {{ record.workOrderNumber }}
          </Button>
        </template>
        <template v-else-if="column.key === 'createdAt'">
          {{ formatDate(record.createdAt) }}
        </template>
        <template v-else-if="column.key === 'confirmedAt'">
          {{ formatDateTime(record.confirmedAt) }}
        </template>
        <template v-else-if="column.key === 'confirmStatus'">
          <Tag :color="record.confirmStatus === 'CONFIRMED' ? 'green' : 'gold'">
            {{ record.confirmStatus === 'CONFIRMED' ? '已完成' : '未完成' }}
          </Tag>
        </template>
      </template>
    </Table>
  </Drawer>
</template>
