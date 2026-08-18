<script lang="ts" setup>
import type { InspectionRequest } from '@qgs/shared';

import type { LocalInspectionReceipt } from './myInspectionReceipts';

import type { PublicInspectionRequestStatus } from '#/api/qms/inspection-request';

import { computed, onMounted, ref } from 'vue';

import { useAccessStore } from '@vben/stores';

import { Empty, Spin, Table, Tag } from 'ant-design-vue';

import {
  getInspectionRequests,
  getPublicInspectionRequestStatus,
} from '#/api/qms/inspection-request';

import { readLocalInspectionReceipts } from './myInspectionReceipts';

interface MyRequestRow {
  dispatcherName: string;
  fromServer: boolean;
  inspectorName: string;
  key: string;
  linkedIssueStatus: null | string;
  partName: string;
  processName: string;
  requestNo: string;
  status: null | string;
  submittedAt: string;
  workOrderNumber: string;
}

const STATUS_META: Record<string, { color: string; text: string }> = {
  CANCELLED: { color: 'default', text: '已取消' },
  CLOSED: { color: 'green', text: '已完成' },
  DISPATCHED: { color: 'cyan', text: '已派单' },
  INSPECTING: { color: 'gold', text: '检验中' },
  SUBMITTED: { color: 'blue', text: '待派单' },
};

const accessStore = useAccessStore();

const isLoggedIn = computed(() => Boolean(accessStore.accessToken));
const loading = ref(false);
const rows = ref<MyRequestRow[]>([]);

function requestToRow(item: InspectionRequest): MyRequestRow {
  return {
    dispatcherName: item.dispatcherName || '',
    fromServer: true,
    inspectorName: item.inspectorName || '',
    key: item.requestNo,
    linkedIssueStatus: item.linkedIssueStatus || null,
    partName: item.partName || '',
    processName: item.processName || '',
    requestNo: item.requestNo,
    status: item.status || null,
    submittedAt: item.submittedAt || '',
    workOrderNumber: item.workOrderNumber || '',
  };
}

function receiptToRow(
  receipt: LocalInspectionReceipt,
  status: null | PublicInspectionRequestStatus,
): MyRequestRow {
  return {
    dispatcherName: status?.dispatcherName || '',
    fromServer: false,
    inspectorName: status?.inspectorName || '',
    key: receipt.requestNo,
    linkedIssueStatus: status?.linkedIssueStatus || null,
    partName: receipt.partName,
    processName: receipt.processName,
    requestNo: receipt.requestNo,
    status: status?.status || null,
    submittedAt: receipt.submittedAt,
    workOrderNumber: receipt.workOrderNumber,
  };
}

async function reload() {
  loading.value = true;
  try {
    const receipts = readLocalInspectionReceipts();
    let localRows: MyRequestRow[] = [];
    if (receipts.length > 0) {
      const statuses = await Promise.all(
        receipts.map((receipt) =>
          getPublicInspectionRequestStatus(receipt.requestNo).catch(() => null),
        ),
      );
      localRows = receipts.map((receipt, index) =>
        receiptToRow(receipt, statuses[index] || null),
      );
    }
    let serverRows: MyRequestRow[] = [];
    if (isLoggedIn.value) {
      try {
        const result = await getInspectionRequests({
          page: 1,
          pageSize: 20,
          scope: 'my-report',
        });
        serverRows = (result.items || []).map((item) => requestToRow(item));
      } catch {
        // Server scope may fail (expired token etc.); local receipts still show.
      }
    }
    const seen = new Set<string>();
    rows.value = [...serverRows, ...localRows].filter((row) => {
      if (seen.has(row.requestNo)) return false;
      seen.add(row.requestNo);
      return true;
    });
  } finally {
    loading.value = false;
  }
}

function statusTag(status: null | string) {
  const meta = status ? STATUS_META[status] : undefined;
  return meta
    ? { color: meta.color, text: meta.text }
    : { color: '', text: '未知' };
}

const columns = [
  { dataIndex: 'requestNo', key: 'requestNo', title: '报检单号' },
  { dataIndex: 'partName', key: 'partName', title: '部件' },
  { dataIndex: 'processName', key: 'processName', title: '工序' },
  { dataIndex: 'workOrderNumber', key: 'workOrderNumber', title: '工单号' },
  { dataIndex: 'status', key: 'status', title: '状态' },
  { dataIndex: 'inspectorName', key: 'inspectorName', title: '检验员' },
  { dataIndex: 'dispatcherName', key: 'dispatcherName', title: '派单员' },
];

onMounted(reload);
defineExpose({ reload });
</script>

<template>
  <div class="my-inspection-requests">
    <Spin :spinning="loading">
      <Table
        v-if="rows.length > 0"
        :columns="columns"
        :data-source="rows"
        :pagination="false"
        row-key="requestNo"
        size="small"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'status'">
            <Tag :color="statusTag(record.status).color">
              {{ statusTag(record.status).text }}
            </Tag>
            <Tag v-if="record.linkedIssueStatus === 'OPEN'" color="red">
              异常NC
            </Tag>
          </template>
          <template v-else-if="column.key === 'requestNo'">
            <span class="font-medium">{{ record.requestNo }}</span>
          </template>
          <template v-else-if="column.key === 'partName'">
            {{ record.partName || '-' }}
          </template>
          <template v-else-if="column.key === 'inspectorName'">
            {{ record.inspectorName || '-' }}
          </template>
          <template v-else-if="column.key === 'dispatcherName'">
            {{ record.dispatcherName || '-' }}
          </template>
        </template>
      </Table>
      <Empty
        v-else
        :description="
          isLoggedIn
            ? '暂无报检记录'
            : '本机暂无报检记录（匿名报检仅保存在当前设备，登录后报检可在任意设备查看）'
        "
      />
    </Spin>
  </div>
</template>
