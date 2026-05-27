<script setup lang="ts">
import type { InspectionRequest } from '#/api/qms/inspection-request';

import { IconifyIcon } from '@vben/icons';

import {
  Button,
  Dropdown,
  Menu,
  Space,
  Table,
  Tag,
  Tooltip,
} from 'ant-design-vue';

export interface InspectionRequestTableProps {
  canDelete: boolean;
  loading: boolean;
  page: number;
  pageSize: number;
  requests: InspectionRequest[];
  total: number;
  rowClassName: (record: InspectionRequest) => string;
  statusColor: (status: InspectionRequest['status']) => string;
  statusLabel: (status: InspectionRequest['status']) => string;
  inspectionResultColor: (record: InspectionRequest) => string;
  inspectionResultLabel: (record: InspectionRequest) => string;
  inspectionQuantityText: (record: InspectionRequest) => string;
  hasLinkedIssue: (record: InspectionRequest) => boolean;
  missingValueClass: (value?: null | string) => string;
  displayInspector: (record: InspectionRequest) => string;
  displayDispatcher: (record: InspectionRequest) => string;
  waitDuration: (record: InspectionRequest) => string;
  executionDurationLabel: (record: InspectionRequest) => string;
  directClosedClass: (record: InspectionRequest) => string;
  displayExecutionDuration: (record: InspectionRequest) => string;
  displayDispatchTime: (record: InspectionRequest) => string;
  formatDateTime: (value?: null | string) => string;
  checkResultLabel: (result: InspectionRequest['selfCheckResult']) => string;
  isDispatchable: (record: InspectionRequest) => boolean;
  isCompletable: (record: InspectionRequest) => boolean;
  isClosed: (record: InspectionRequest) => boolean;
  hasActionMenu: (record: InspectionRequest) => boolean;
}

const props = defineProps<InspectionRequestTableProps>();

const emit = defineEmits<{
  close: [record: InspectionRequest];
  delete: [record: InspectionRequest];
  detail: [record: InspectionRequest];
  dispatch: [record: InspectionRequest];
  pageChange: [nextPage: number, nextPageSize: number];
  qr: [record: InspectionRequest];
  record: [record: InspectionRequest];
}>();

function handleActionMenuClick(record: InspectionRequest, key: unknown) {
  const action = String(key);
  if (action === 'delete') {
    emit('delete', record);
    return;
  }
  if (action === 'qr') {
    emit('qr', record);
    return;
  }
  if (action === 'record') {
    emit('record', record);
  }
}
</script>

<template>
  <Table
    row-key="id"
    :data-source="props.requests"
    :loading="props.loading"
    :row-class-name="props.rowClassName"
    :pagination="{
      current: props.page,
      pageSize: props.pageSize,
      total: props.total,
      showSizeChanger: true,
      onChange: (nextPage: number, nextPageSize: number) => {
        emit('pageChange', nextPage, nextPageSize);
      },
    }"
    size="small"
  >
    <Table.Column title="任务" :min-width="280">
      <template #default="{ record }">
        <div class="min-w-0 space-y-0.5">
          <div class="truncate font-medium text-gray-900">
            {{ record.partName }}
            <span v-if="record.componentName">
              / {{ record.componentName }}
            </span>
          </div>
          <div class="truncate text-xs text-gray-500">
            {{ record.processName }} · {{ record.quantity || 1 }}
          </div>
          <div class="truncate text-xs text-gray-400">
            {{ record.requestNo }} / {{ record.workOrderNumber }}
          </div>
        </div>
      </template>
    </Table.Column>
    <Table.Column title="报检" width="210">
      <template #default="{ record }">
        <div class="space-y-0.5 text-xs">
          <div class="truncate text-gray-700">
            {{ record.reporter }}
            <span class="text-gray-400">/ {{ record.team || '-' }}</span>
          </div>
          <div class="truncate text-gray-500">
            {{ props.formatDateTime(record.submittedAt) }}
          </div>
          <div class="truncate text-gray-400">
            自检 {{ props.checkResultLabel(record.selfCheckResult) }} / 互检
            {{ props.checkResultLabel(record.mutualCheckResult) }}
          </div>
        </div>
      </template>
    </Table.Column>
    <Table.Column title="状态" width="110">
      <template #default="{ record }">
        <div class="space-y-1">
          <Tag :color="props.statusColor(record.status)">
            {{ props.statusLabel(record.status) }}
          </Tag>
          <Tag
            v-if="
              record.status === 'CLOSED' || record.inspectionResult === 'FAIL'
            "
            :color="props.inspectionResultColor(record)"
          >
            {{ props.inspectionResultLabel(record) }}
          </Tag>
          <div
            v-if="
              record.status === 'CLOSED' || record.inspectionResult === 'FAIL'
            "
            class="text-xs text-gray-500"
          >
            {{ props.inspectionQuantityText(record) }}
          </div>
          <div v-if="props.hasLinkedIssue(record)" class="text-xs text-red-500">
            {{ record.linkedIssueNo || '已生成不合格项' }}
          </div>
        </div>
      </template>
    </Table.Column>
    <Table.Column title="执行" width="260">
      <template #default="{ record }">
        <div class="space-y-0.5 text-xs">
          <div class="truncate">
            <span class="text-gray-500">检：</span>
            <span :class="props.missingValueClass(record.inspectorName)">
              {{ props.displayInspector(record) }}
            </span>
            <span class="mx-1 text-gray-300">/</span>
            <span class="text-gray-500">调：</span>
            <span :class="props.missingValueClass(record.dispatcherName)">
              {{ props.displayDispatcher(record) }}
            </span>
          </div>
          <div class="truncate">
            <span class="text-gray-500">等待：</span>
            <span>{{ props.waitDuration(record) }}</span>
            <span class="mx-1 text-gray-300">/</span>
            <span class="text-gray-500">
              {{ props.executionDurationLabel(record) }}：
            </span>
            <span :class="props.directClosedClass(record)">
              {{ props.displayExecutionDuration(record) }}
            </span>
          </div>
          <div class="truncate text-gray-400">
            派单：<span :class="props.directClosedClass(record)">
              {{ props.displayDispatchTime(record) }}
            </span>
          </div>
        </div>
      </template>
    </Table.Column>
    <Table.Column title="操作" width="180" fixed="right">
      <template #default="{ record }">
        <Space size="small">
          <Button size="small" @click="emit('detail', record)">
            <template #icon>
              <IconifyIcon icon="lucide:list-checks" />
            </template>
            详情
          </Button>
          <Button
            v-if="props.isDispatchable(record)"
            size="small"
            @click="emit('dispatch', record)"
          >
            <template #icon><IconifyIcon icon="lucide:send" /></template>
            派单
          </Button>
          <Button
            v-if="props.isCompletable(record)"
            size="small"
            type="primary"
            @click="emit('close', record)"
          >
            <template #icon>
              <IconifyIcon icon="lucide:check-circle" />
            </template>
            完成
          </Button>
          <Dropdown v-if="props.hasActionMenu(record)" trigger="click">
            <Tooltip title="更多操作">
              <Button size="small">
                <template #icon>
                  <IconifyIcon icon="lucide:more-horizontal" />
                </template>
              </Button>
            </Tooltip>
            <template #overlay>
              <Menu @click="({ key }) => handleActionMenuClick(record, key)">
                <Menu.Item v-if="!props.isClosed(record)" key="qr">
                  <template #icon>
                    <IconifyIcon icon="lucide:qr-code" />
                  </template>
                  二维码
                </Menu.Item>
                <Menu.Item v-if="record.inspectionId" key="record">
                  <template #icon>
                    <IconifyIcon icon="lucide:file-check-2" />
                  </template>
                  查看记录
                </Menu.Item>
                <Menu.Item v-if="props.canDelete" key="delete" danger>
                  <template #icon>
                    <IconifyIcon icon="lucide:trash-2" />
                  </template>
                  删除
                </Menu.Item>
              </Menu>
            </template>
          </Dropdown>
        </Space>
      </template>
    </Table.Column>
  </Table>
</template>
