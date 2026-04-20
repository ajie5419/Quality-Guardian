<script lang="ts" setup>
import type {
  WorkbenchProjectItem,
  WorkbenchTodoItem,
  WorkbenchTrendItem,
} from '@vben/common-ui';

import type { WorkspaceWorkOrderAggregateResponse } from '#/api/qms/workspace';
import type { SystemDeptApi } from '#/api/system/dept';

import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';

import {
  WorkbenchHeader,
  WorkbenchProject,
  WorkbenchTodo,
  WorkbenchTrends,
} from '@vben/common-ui';
import { useI18n } from '@vben/locales';
import { preferences } from '@vben/preferences';
import { useUserStore } from '@vben/stores';
import { openWindow } from '@vben/utils';

import {
  Button,
  Descriptions,
  Drawer,
  Form,
  Input,
  message,
  Modal,
  Select,
  Spin,
  Table,
  Tag,
} from 'ant-design-vue';

import {
  confirmWorkOrderRequirement,
  uploadWorkOrderRequirements,
} from '#/api/qms/work-order';
import { getWorkspaceWorkOrderAggregate } from '#/api/qms/workspace';
import { getDeptList } from '#/api/system/dept';
import { useErrorHandler } from '#/hooks/useErrorHandler';
import { useWorkspaceQuery } from '#/hooks/useQmsQueries';
import { findNameById } from '#/types';
import TeamSelect from '#/views/qms/inspection/records/components/form/TeamSelect.vue';
import { getProcessOptions } from '#/views/qms/inspection/records/config';

const userStore = useUserStore();
const router = useRouter();
const { t } = useI18n();
const { handleApiError } = useErrorHandler();
const processOptions = computed(() => getProcessOptions(t));

// 使用 vue-query 缓存查询
const { data: workspaceData } = useWorkspaceQuery();

// 计算属性从缓存数据中提取
const projectItems = computed<WorkbenchProjectItem[]>(
  () => workspaceData.value?.projectItems || [],
);
const todoItems = computed<WorkbenchTodoItem[]>(
  () => workspaceData.value?.todoItems || [],
);
const trendItems = computed<WorkbenchTrendItem[]>(
  () => workspaceData.value?.trendItems || [],
);
const stats = computed(
  () =>
    workspaceData.value?.stats || {
      todayWorkOrders: 0,
      todayInspections: 0,
      todayIssues: 0,
      openIssuesCount: 0,
    },
);
const aggregateVisible = ref(false);
const aggregateLoading = ref(false);
const creatingRequirement = ref(false);
const requirementModalVisible = ref(false);
const selectedWorkOrderNumber = ref('');
const aggregateData = ref<null | WorkspaceWorkOrderAggregateResponse>(null);
const deptRawData = ref<SystemDeptApi.Dept[]>([]);
const requirementForm = ref({
  attachment: '',
  partName: '',
  processName: '',
  requirementItemsText: '',
  requirementName: '',
  responsiblePerson: '',
  responsibleTeam: '',
});

function parseWorkOrderNumber(nav: WorkbenchProjectItem) {
  if (String(nav.url || '').startsWith('/qms/work-order')) {
    return String(nav.title || '').trim();
  }
  return '';
}

async function openWorkOrderAggregate(workOrderNumber: string) {
  if (deptRawData.value.length === 0) {
    try {
      deptRawData.value = await getDeptList();
    } catch (error) {
      handleApiError(error, 'Load Workspace Departments');
    }
  }
  aggregateLoading.value = true;
  aggregateVisible.value = true;
  selectedWorkOrderNumber.value = workOrderNumber;
  try {
    const data = await getWorkspaceWorkOrderAggregate({ workOrderNumber });
    aggregateData.value = data;
  } catch (error) {
    aggregateVisible.value = false;
    aggregateData.value = null;
    handleApiError(error, 'Load Workspace Work Order Aggregate');
  } finally {
    aggregateLoading.value = false;
  }
}

function getDivisionLabel(value?: string) {
  const idOrName = String(value || '').trim();
  if (!idOrName) return '-';
  return findNameById(deptRawData.value, idOrName) || idOrName;
}

function getWorkOrderStatusLabel(value?: string) {
  const status = String(value || '')
    .trim()
    .toUpperCase();
  if (status === 'COMPLETED') return '已完成';
  if (status === 'IN_PROGRESS') return '进行中';
  if (status === 'CANCELLED') return '已取消';
  if (status === 'OPEN') return '未开始';
  return value || '-';
}

function formatDateTime(value?: string) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', { hour12: false });
}

function formatDate(value?: string) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('zh-CN');
}

function openRequirementModal() {
  requirementForm.value = {
    attachment: '',
    partName: '',
    processName: '',
    requirementItemsText: '',
    requirementName: '',
    responsiblePerson: '',
    responsibleTeam: '',
  };
  requirementModalVisible.value = true;
}

async function submitRequirement() {
  const workOrderNumber = selectedWorkOrderNumber.value;
  if (!workOrderNumber) {
    message.warning('请先选择工单');
    return;
  }
  const requirementName = requirementForm.value.requirementName.trim();
  if (!requirementName) {
    message.warning('要求名称不能为空');
    return;
  }
  const items = requirementForm.value.requirementItemsText
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);

  creatingRequirement.value = true;
  try {
    await uploadWorkOrderRequirements({
      requirements: [
        {
          attachment: requirementForm.value.attachment.trim() || undefined,
          items,
          partName: requirementForm.value.partName.trim() || undefined,
          processName: requirementForm.value.processName.trim() || undefined,
          requirementName,
          responsiblePerson:
            requirementForm.value.responsiblePerson.trim() || undefined,
          responsibleTeam:
            requirementForm.value.responsibleTeam.trim() || undefined,
          workOrderNumber,
        },
      ],
    });
    message.success('要求已新增');
    requirementModalVisible.value = false;
    await openWorkOrderAggregate(workOrderNumber);
  } catch (error) {
    handleApiError(error, 'Create Work Order Requirement');
  } finally {
    creatingRequirement.value = false;
  }
}

async function confirmRequirement(id: string) {
  if (!id) return;
  try {
    await confirmWorkOrderRequirement(id, true);
    message.success('已确认完成');
    if (selectedWorkOrderNumber.value) {
      await openWorkOrderAggregate(selectedWorkOrderNumber.value);
    }
  } catch (error) {
    handleApiError(error, 'Confirm Work Order Requirement');
  }
}

async function unconfirmRequirement(id: string) {
  if (!id) return;
  try {
    await confirmWorkOrderRequirement(id, false);
    message.success('已撤销确认');
    if (selectedWorkOrderNumber.value) {
      await openWorkOrderAggregate(selectedWorkOrderNumber.value);
    }
  } catch (error) {
    handleApiError(error, 'Unconfirm Work Order Requirement');
  }
}

function getExecutionStatusColor(
  value?:
    | 'CONFIRMED'
    | 'EXECUTED_PENDING_CONFIRM'
    | 'MANUAL_CONFIRMED'
    | 'NOT_EXECUTED',
) {
  if (value === 'CONFIRMED') return 'green';
  if (value === 'MANUAL_CONFIRMED') return 'cyan';
  if (value === 'EXECUTED_PENDING_CONFIRM') return 'gold';
  return 'red';
}

function getExecutionStatusText(
  value?:
    | 'CONFIRMED'
    | 'EXECUTED_PENDING_CONFIRM'
    | 'MANUAL_CONFIRMED'
    | 'NOT_EXECUTED',
) {
  if (value === 'CONFIRMED') return '已确认';
  if (value === 'MANUAL_CONFIRMED') return '手动确认';
  if (value === 'EXECUTED_PENDING_CONFIRM') return '待确认';
  return '未执行';
}

function navToWorkOrderPage() {
  if (!selectedWorkOrderNumber.value) return;
  router.push({
    path: '/qms/work-order',
    query: { workOrderNumber: selectedWorkOrderNumber.value },
  });
}

async function navTo(nav: WorkbenchProjectItem) {
  const workOrderNumber = parseWorkOrderNumber(nav);
  if (workOrderNumber) {
    await openWorkOrderAggregate(workOrderNumber);
    return;
  }
  if (nav.url?.startsWith('http')) {
    openWindow(nav.url);
    return;
  }
  if (nav.url?.startsWith('/')) {
    router.push(nav.url).catch((error) => {
      handleApiError(error, 'Workspace Navigation');
    });
  }
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 6) return t('common.greeting.earlyMorning');
  if (hour < 9) return t('common.greeting.morning');
  if (hour < 12) return t('common.greeting.forenoon');
  if (hour < 14) return t('common.greeting.noon');
  if (hour < 18) return t('common.greeting.afternoon');
  if (hour < 22) return t('common.greeting.evening');
  return t('common.greeting.lateNight');
}
</script>

<template>
  <div class="p-5">
    <WorkbenchHeader
      :avatar="userStore.userInfo?.avatar || preferences.app.defaultAvatar"
    >
      <template #title>
        {{ getGreeting() }},
        {{
          t('qms.workspace.startWork', {
            user: userStore.userInfo?.realName || t('common.user'),
          })
        }}
      </template>
      <template #description>
        <span class="mr-4"
          >📋 {{ t('qms.workspace.todayWorkOrders') }}:
          <strong>{{ stats.todayWorkOrders }}</strong></span
        >
        <span class="mr-4"
          >🔍 {{ t('qms.workspace.todayInspections') }}:
          <strong>{{ stats.todayInspections }}</strong></span
        >
        <span class="mr-4"
          >⚠️ {{ t('qms.workspace.openIssues') }}:
          <strong class="text-red-500">{{
            stats.openIssuesCount
          }}</strong></span
        >
      </template>
    </WorkbenchHeader>

    <div class="mt-5 flex flex-col lg:flex-row">
      <div class="mr-4 w-full lg:w-3/5">
        <WorkbenchProject
          :items="projectItems"
          :title="t('qms.workspace.workOrderList')"
          @click="navTo"
        />
        <WorkbenchTrends
          :items="trendItems"
          class="mt-5"
          :title="t('qms.workspace.latestIssueTrends')"
        />
      </div>
      <div class="w-full lg:w-2/5">
        <WorkbenchTodo
          :items="todoItems"
          class="mt-5 lg:mt-0"
          title="待处理的工程问题"
        />
      </div>
    </div>

    <Drawer
      v-model:open="aggregateVisible"
      :title="`工单聚合看板 - ${selectedWorkOrderNumber || '-'}`"
      width="980"
    >
      <template #extra>
        <div class="flex items-center gap-2">
          <Button type="primary" size="small" @click="openRequirementModal">
            新增要求
          </Button>
          <Button type="link" @click="navToWorkOrderPage">前往工单管理</Button>
        </div>
      </template>
      <Spin :spinning="aggregateLoading">
        <div v-if="aggregateData" class="space-y-4">
          <Descriptions :column="3" bordered size="small">
            <Descriptions.Item label="工单号">
              {{ aggregateData.workOrder.workOrderNumber || '-' }}
            </Descriptions.Item>
            <Descriptions.Item label="项目名称">
              {{ aggregateData.workOrder.projectName || '-' }}
            </Descriptions.Item>
            <Descriptions.Item label="客户名称">
              {{ aggregateData.workOrder.customerName || '-' }}
            </Descriptions.Item>
            <Descriptions.Item label="事业部">
              {{ getDivisionLabel(aggregateData.workOrder.division) }}
            </Descriptions.Item>
            <Descriptions.Item label="工单数量">
              {{ aggregateData.workOrder.quantity || 0 }}
            </Descriptions.Item>
            <Descriptions.Item label="状态">
              {{ getWorkOrderStatusLabel(aggregateData.workOrder.status) }}
            </Descriptions.Item>
          </Descriptions>

          <div class="py-2 text-center text-2xl font-bold text-black">
            工作事项安排与跟踪表
          </div>

          <div class="space-y-3 rounded border border-gray-200 p-3">
            <div class="text-base font-semibold text-black">制作进度</div>
            <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div>
                <div class="mb-2 text-sm font-medium text-gray-700">
                  过程进度
                </div>
                <Table
                  size="small"
                  :pagination="false"
                  :data-source="aggregateData.productionProgress?.process || []"
                  :columns="[
                    {
                      title: '部件名称',
                      dataIndex: 'partName',
                      key: 'partName',
                      ellipsis: true,
                    },
                    {
                      title: '工序',
                      dataIndex: 'processName',
                      key: 'processName',
                      width: 100,
                    },
                    {
                      title: '数量',
                      dataIndex: 'quantity',
                      key: 'quantity',
                      width: 80,
                    },
                    {
                      title: '日期',
                      dataIndex: 'date',
                      key: 'date',
                      width: 120,
                    },
                  ]"
                  :row-key="(record) => record.id"
                >
                  <template #bodyCell="{ column, record }">
                    <template v-if="column.key === 'date'">
                      {{ formatDate(record.date) }}
                    </template>
                  </template>
                </Table>
              </div>

              <div>
                <div class="mb-2 text-sm font-medium text-gray-700">
                  外购件进度
                </div>
                <Table
                  size="small"
                  :pagination="false"
                  :data-source="
                    aggregateData.productionProgress?.outsourced || []
                  "
                  :columns="[
                    {
                      title: '外购件名称',
                      dataIndex: 'materialName',
                      key: 'materialName',
                      ellipsis: true,
                    },
                    {
                      title: '日期',
                      dataIndex: 'date',
                      key: 'date',
                      width: 120,
                    },
                  ]"
                  :row-key="(record) => record.id"
                >
                  <template #bodyCell="{ column, record }">
                    <template v-if="column.key === 'date'">
                      {{ formatDate(record.date) }}
                    </template>
                  </template>
                </Table>
              </div>
            </div>
          </div>

          <Table
            class="workspace-requirement-table"
            size="middle"
            :pagination="false"
            :scroll="{ x: 1380 }"
            :data-source="aggregateData.requirements"
            :columns="[
              { title: '序号', key: 'seq', width: 70 },
              {
                title: 'OBU单元',
                dataIndex: 'division',
                key: 'division',
                width: 120,
                ellipsis: true,
              },
              {
                title: '工单号',
                dataIndex: 'workOrderNumber',
                key: 'workOrderNumber',
                width: 130,
                ellipsis: true,
              },
              {
                title: '项目名称',
                dataIndex: 'projectName',
                key: 'projectName',
                width: 140,
                ellipsis: true,
              },
              {
                title: '内容描述',
                dataIndex: 'requirementName',
                key: 'requirementName',
                width: 170,
                ellipsis: true,
              },
              {
                title: '文件',
                dataIndex: 'attachment',
                key: 'attachment',
                width: 90,
              },
              {
                title: '下发日期',
                dataIndex: 'createdAt',
                key: 'createdAt',
                width: 120,
              },
              {
                title: '责任班组',
                dataIndex: 'responsibleTeam',
                key: 'responsibleTeam',
                width: 120,
                ellipsis: true,
              },
              { title: '完成情况', key: 'executionStatus', width: 110 },
              {
                title: '执行人',
                dataIndex: 'executor',
                key: 'executor',
                width: 100,
                ellipsis: true,
              },
              {
                title: '完成时间',
                dataIndex: 'confirmedAt',
                key: 'confirmedAt',
                width: 180,
              },
              { title: '操作', key: 'action', width: 110 },
            ]"
            :row-key="
              (record) =>
                `${record.partName}-${record.processName}-${record.id}`
            "
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'seq'">
                {{
                  aggregateData.requirements.findIndex(
                    (item) => item.id === record.id,
                  ) + 1
                }}
              </template>
              <template v-else-if="column.key === 'division'">
                {{ getDivisionLabel(aggregateData.workOrder.division) }}
              </template>
              <template v-else-if="column.key === 'projectName'">
                {{ aggregateData.workOrder.projectName || '-' }}
              </template>
              <template v-else-if="column.key === 'createdAt'">
                {{
                  record.createdAt
                    ? new Date(record.createdAt).toLocaleDateString('zh-CN')
                    : '-'
                }}
              </template>
              <template v-else-if="column.key === 'attachment'">
                <a
                  v-if="record.attachment"
                  :href="record.attachment"
                  target="_blank"
                  class="text-blue-600 underline"
                >
                  文件
                </a>
                <span v-else class="text-gray-400">未上传</span>
              </template>
              <template v-else-if="column.key === 'responsibleTeam'">
                {{
                  record.responsibleTeam ||
                  getDivisionLabel(aggregateData.workOrder.division)
                }}
              </template>
              <template v-else-if="column.key === 'executionStatus'">
                <Tag :color="getExecutionStatusColor(record.executionStatus)">
                  {{ getExecutionStatusText(record.executionStatus) }}
                </Tag>
              </template>
              <template v-else-if="column.key === 'confirmedAt'">
                {{ formatDateTime(record.confirmedAt) }}
              </template>
              <template v-else-if="column.key === 'action'">
                <div class="flex items-center gap-2">
                  <Button
                    v-if="
                      record.executionStatus !== 'CONFIRMED' &&
                      record.executionStatus !== 'MANUAL_CONFIRMED'
                    "
                    type="link"
                    size="small"
                    @click="confirmRequirement(record.id)"
                  >
                    确认完成
                  </Button>
                  <Button
                    v-else
                    type="link"
                    size="small"
                    @click="unconfirmRequirement(record.id)"
                  >
                    撤销确认
                  </Button>
                </div>
              </template>
            </template>
          </Table>
        </div>
      </Spin>
    </Drawer>

    <Modal
      v-model:open="requirementModalVisible"
      title="新增工单要求"
      :confirm-loading="creatingRequirement"
      @ok="submitRequirement"
    >
      <Form layout="vertical">
        <Form.Item label="要求名称" required>
          <Input
            v-model:value="requirementForm.requirementName"
            placeholder="例如：焊缝外观复检要求"
          />
        </Form.Item>
        <Form.Item label="部件名称">
          <Input
            v-model:value="requirementForm.partName"
            placeholder="例如：底盘总成"
          />
        </Form.Item>
        <Form.Item label="工序">
          <Select
            v-model:value="requirementForm.processName"
            :options="processOptions"
            placeholder="请选择工序"
            show-search
            allow-clear
          />
        </Form.Item>
        <Form.Item label="文件链接">
          <Input
            v-model:value="requirementForm.attachment"
            placeholder="例如：https://.../需求变更.pdf"
          />
        </Form.Item>
        <Form.Item label="责任班组">
          <TeamSelect v-model:value="requirementForm.responsibleTeam" />
        </Form.Item>
        <Form.Item label="责任人">
          <Input
            v-model:value="requirementForm.responsiblePerson"
            placeholder="例如：张三"
          />
        </Form.Item>
        <Form.Item label="要求项点（每行一条）">
          <Input.TextArea
            v-model:value="requirementForm.requirementItemsText"
            :rows="6"
            placeholder="输入项点，每行一条，例如：&#10;焊缝高度一致&#10;无夹渣气孔"
          />
        </Form.Item>
      </Form>
    </Modal>
  </div>
</template>

<style scoped>
:deep(.workspace-requirement-table .ant-table-cell) {
  white-space: nowrap;
}
</style>
