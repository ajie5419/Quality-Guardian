<script lang="ts" setup>
import type { UploadChangeParam, UploadFile } from 'ant-design-vue';

import type {
  WorkOrderRequirementAttachment,
  WorkspaceWorkOrderAggregateResponse,
} from '#/api/qms/workspace';

import { computed, ref } from 'vue';

import { useI18n } from '@vben/locales';
import { useAccessStore } from '@vben/stores';

import {
  Alert,
  Button,
  Drawer,
  Form,
  Input,
  message,
  Modal,
  Segmented,
  Select,
  Table,
  Tabs,
  Tag,
  Upload,
} from 'ant-design-vue';

import {
  confirmWorkOrderRequirement,
  uploadWorkOrderRequirements,
} from '#/api/qms/work-order';
import { useErrorHandler } from '#/hooks/useErrorHandler';
import TeamSelect from '#/views/qms/inspection/records/components/form/TeamSelect.vue';
import { getProcessOptions } from '#/views/qms/inspection/records/config';

type RequirementFilter = 'all' | 'done' | 'overdue' | 'pending';

const props = defineProps<{
  aggregateData: null | WorkspaceWorkOrderAggregateResponse;
  divisionLabel: string;
  loading: boolean;
  open: boolean;
  workOrderNumber: string;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'goWorkOrder'): void;
  (e: 'refresh'): void;
}>();

const { t } = useI18n();
const { handleApiError } = useErrorHandler();
const accessStore = useAccessStore();

const processOptions = computed(() => getProcessOptions(t));
const uploadHeaders = computed(() => ({
  Authorization: `Bearer ${accessStore.accessToken}`,
}));
const activeTab = ref<'progress' | 'requirements'>('requirements');
const requirementFilter = ref<RequirementFilter>('all');
const creatingRequirement = ref(false);
const requirementModalVisible = ref(false);
const requirementForm = ref({
  attachments: [] as UploadFile[],
  partName: '',
  processName: '',
  requirementItemsText: '',
  requirementName: '',
  responsiblePerson: '',
  responsibleTeam: '',
});

const workOrderStatusLabel = computed(() => {
  const status = String(props.aggregateData?.workOrder.status || '')
    .trim()
    .toUpperCase();
  if (status === 'COMPLETED') return '已完成';
  if (status === 'IN_PROGRESS') return '进行中';
  if (status === 'CANCELLED') return '已取消';
  if (status === 'OPEN') return '未开始';
  return props.aggregateData?.workOrder.status || '-';
});

const summarySentence = computed(() => {
  const summary = props.aggregateData?.summary;
  if (!summary) return '';
  return `当前有 ${summary.pendingRequirements} 条要求未闭环，其中 ${summary.overdueUnconfirmedRequirements} 条超过10天未关注。`;
});

const filteredRequirements = computed(() => {
  const list = props.aggregateData?.requirements || [];
  switch (requirementFilter.value) {
    case 'done': {
      return list.filter(
        (item) =>
          item.executionStatus === 'CONFIRMED' ||
          item.executionStatus === 'MANUAL_CONFIRMED',
      );
    }
    case 'overdue': {
      return list.filter(
        (item) =>
          item.confirmStatus !== 'CONFIRMED' &&
          Date.now() - new Date(item.createdAt).getTime() >
            10 * 24 * 60 * 60 * 1000,
      );
    }
    case 'pending': {
      return list.filter(
        (item) =>
          item.executionStatus !== 'CONFIRMED' &&
          item.executionStatus !== 'MANUAL_CONFIRMED',
      );
    }
    default: {
      return list;
    }
  }
});

const riskItems = computed(() => {
  const list = props.aggregateData?.requirements || [];
  const missingInspection = list.filter(
    (item) =>
      !item.executed &&
      item.executionStatus !== 'CONFIRMED' &&
      item.executionStatus !== 'MANUAL_CONFIRMED',
  ).length;
  const overdue =
    props.aggregateData?.summary.overdueUnconfirmedRequirements || 0;
  return [
    missingInspection > 0
      ? `有 ${missingInspection} 条要求尚未匹配到任何检验记录。`
      : '',
    overdue > 0 ? `有 ${overdue} 条要求下发超过10天仍未确认。` : '',
  ].filter(Boolean);
});

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

function getProcessProgressColor(value?: 'COMPLETE' | 'PARTIAL') {
  return value === 'COMPLETE' ? 'green' : 'gold';
}

function formatCoverageProgress(
  coveredQuantity?: number,
  totalQuantity?: number,
) {
  const covered = Math.max(0, Number(coveredQuantity) || 0);
  const total = Math.max(0, Number(totalQuantity) || 0);
  if (total <= 0) return '-';
  return `${Math.min(covered, total)}/${total}`;
}

function openRequirementModal() {
  requirementForm.value = {
    attachments: [],
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
  const workOrderNumber = props.workOrderNumber;
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
          attachments: normalizeAttachmentPayload(
            requirementForm.value.attachments,
          ),
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
    emit('refresh');
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
    emit('refresh');
  } catch (error) {
    handleApiError(error, 'Confirm Work Order Requirement');
  }
}

async function unconfirmRequirement(id: string) {
  if (!id) return;
  try {
    await confirmWorkOrderRequirement(id, false);
    message.success('已撤销确认');
    emit('refresh');
  } catch (error) {
    handleApiError(error, 'Unconfirm Work Order Requirement');
  }
}

function normalizeAttachmentPayload(
  files: UploadFile[],
): WorkOrderRequirementAttachment[] {
  return files
    .map((file) => {
      const response = file.response as
        | undefined
        | {
            data?: { thumbUrl?: string; url?: string };
          };
      const url = String(file.url || response?.data?.url || '').trim();
      if (!url) return null;
      return {
        name: String(file.name || '').trim() || undefined,
        thumbUrl:
          String(file.thumbUrl || response?.data?.thumbUrl || '').trim() ||
          undefined,
        type: String(file.type || '').trim() || undefined,
        url,
      };
    })
    .filter(Boolean) as WorkOrderRequirementAttachment[];
}

function handleAttachmentUploadChange(info: UploadChangeParam<UploadFile>) {
  if (info.file.status === 'done') {
    const response = info.file.response as
      | undefined
      | {
          code?: number;
          data?: { thumbUrl?: string; url?: string };
        };
    if (response?.code === 0 && response.data?.url) {
      info.file.url = response.data.url;
      if (response.data.thumbUrl) {
        info.file.thumbUrl = response.data.thumbUrl;
      }
      message.success(`${info.file.name} 上传成功`);
    } else {
      message.warning('附件上传完成，但未返回有效地址');
    }
  } else if (info.file.status === 'error') {
    message.error(`${info.file.name} 上传失败`);
  }
  requirementForm.value.attachments = [...info.fileList];
}
</script>

<template>
  <Drawer
    :open="open"
    :title="`工单聚合看板 - ${workOrderNumber || '-'}`"
    width="1100"
    @close="emit('close')"
  >
    <template #extra>
      <div class="flex items-center gap-2">
        <Button type="primary" size="small" @click="openRequirementModal">
          新增要求
        </Button>
        <Button type="link" @click="emit('goWorkOrder')">前往工单管理</Button>
      </div>
    </template>

    <div v-if="aggregateData" class="aggregate-layout">
      <section class="summary-strip">
        <div class="summary-strip__main">
          <span class="summary-strip__code">
            {{ aggregateData.workOrder.workOrderNumber || '-' }}
          </span>
          <span class="summary-strip__sep">|</span>
          <span>{{ aggregateData.workOrder.projectName || '-' }}</span>
          <span class="summary-strip__sep">|</span>
          <span>{{ divisionLabel }}</span>
          <span class="summary-strip__status">{{ workOrderStatusLabel }}</span>
        </div>
        <div class="summary-strip__meta">
          <span>客户：{{ aggregateData.workOrder.customerName || '-' }}</span>
          <span>数量：{{ aggregateData.workOrder.quantity || 0 }}</span>
        </div>
      </section>

      <section class="stats-grid">
        <div class="metric-card metric-card--blue">
          <div class="metric-card__label">要求总数</div>
          <div class="metric-card__value">
            {{ aggregateData.summary.plannedRequirements }}
          </div>
        </div>
        <div class="metric-card metric-card--green">
          <div class="metric-card__label">已确认</div>
          <div class="metric-card__value">
            {{ aggregateData.summary.confirmedRequirements }}
          </div>
        </div>
        <div class="metric-card metric-card--amber">
          <div class="metric-card__label">待确认</div>
          <div class="metric-card__value">
            {{ aggregateData.summary.pendingRequirements }}
          </div>
        </div>
        <div class="metric-card metric-card--red">
          <div class="metric-card__label">超10天未关注</div>
          <div class="metric-card__value">
            {{ aggregateData.summary.overdueUnconfirmedRequirements }}
          </div>
        </div>
      </section>

      <Alert
        type="info"
        show-icon
        :message="summarySentence"
        class="summary-alert"
      />

      <div v-if="riskItems.length > 0" class="risk-panel">
        <div class="risk-panel__title">风险提醒</div>
        <div v-for="item in riskItems" :key="item" class="risk-panel__item">
          {{ item }}
        </div>
      </div>

      <Tabs v-model:active-key="activeTab">
        <Tabs.TabPane key="requirements" tab="要求跟踪">
          <div class="tab-toolbar">
            <Segmented
              v-model:value="requirementFilter"
              :options="[
                { label: '全部', value: 'all' },
                { label: '未完成', value: 'pending' },
                { label: '超期', value: 'overdue' },
                { label: '已完成', value: 'done' },
              ]"
            />
          </div>

          <Table
            class="aggregate-table"
            size="middle"
            :pagination="false"
            :scroll="{ x: 1180 }"
            :data-source="filteredRequirements"
            :columns="[
              { title: '序号', key: 'seq', width: 70 },
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
                width: 140,
                ellipsis: true,
              },
              {
                title: '工序',
                dataIndex: 'processName',
                key: 'processName',
                width: 120,
              },
              {
                title: '附件',
                dataIndex: 'attachments',
                key: 'attachments',
                width: 140,
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
              {
                title: '下发日期',
                dataIndex: 'createdAt',
                key: 'createdAt',
                width: 120,
              },
              { title: '状态', key: 'executionStatus', width: 110 },
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
              { title: '操作', key: 'action', width: 110, fixed: 'right' },
            ]"
            :row-key="(record) => record.id"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'seq'">
                {{
                  filteredRequirements.findIndex(
                    (item) => item.id === record.id,
                  ) + 1
                }}
              </template>
              <template v-else-if="column.key === 'attachments'">
                <div v-if="record.attachments?.length" class="attachment-list">
                  <a
                    v-for="file in record.attachments"
                    :key="file.url"
                    :href="file.url"
                    target="_blank"
                    class="attachment-link"
                    :title="file.name || '附件'"
                  >
                    {{ file.name || '附件' }}
                  </a>
                </div>
                <span v-else class="text-gray-400">无附件</span>
              </template>
              <template v-else-if="column.key === 'createdAt'">
                {{ formatDate(record.createdAt) }}
              </template>
              <template v-else-if="column.key === 'executionStatus'">
                <Tag :color="getExecutionStatusColor(record.executionStatus)">
                  {{ getExecutionStatusText(record.executionStatus) }}
                </Tag>
              </template>
              <template v-else-if="column.key === 'confirmer'">
                {{ record.confirmer || '-' }}
              </template>
              <template v-else-if="column.key === 'confirmedAt'">
                {{ formatDateTime(record.confirmedAt) }}
              </template>
              <template v-else-if="column.key === 'action'">
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
              </template>
            </template>
          </Table>
        </Tabs.TabPane>

        <Tabs.TabPane key="progress" tab="制作进度">
          <div class="progress-stats">
            <div class="progress-stat">
              <div class="progress-stat__label">过程部件数</div>
              <div class="progress-stat__value">
                {{ aggregateData.productionProgress?.process?.length || 0 }}
              </div>
            </div>
          </div>

          <div class="progress-card">
            <div class="progress-card__title">过程部件进度</div>
            <Table
              class="process-progress-table"
              size="middle"
              :pagination="false"
              :data-source="aggregateData.productionProgress?.process || []"
              :scroll="{ x: 980 }"
              :columns="[
                {
                  title: '部件名称',
                  dataIndex: 'partName',
                  key: 'partName',
                  width: 180,
                  ellipsis: true,
                },
                {
                  title: '班组/外协单位',
                  dataIndex: 'teams',
                  key: 'teams',
                  width: 180,
                },
                {
                  title: '已检/总数',
                  key: 'coverageProgress',
                  width: 110,
                },
                {
                  title: '工序进展',
                  dataIndex: 'processes',
                  key: 'processes',
                },
                {
                  title: '最近检验日期',
                  dataIndex: 'date',
                  key: 'date',
                  width: 132,
                },
              ]"
              :row-key="(record) => record.id"
            >
              <template #bodyCell="{ column, record }">
                <template v-if="column.key === 'processes'">
                  <div class="process-tag-list">
                    <Tag
                      v-for="process in record.processes"
                      :key="`${record.id}-${process.processName}`"
                      :color="getProcessProgressColor(process.status)"
                    >
                      {{
                        `${process.processName} ${process.completedQuantity}/${process.totalQuantity}`
                      }}
                    </Tag>
                  </div>
                </template>
                <template v-else-if="column.key === 'coverageProgress'">
                  <div class="coverage-progress">
                    {{
                      formatCoverageProgress(
                        record.coveredQuantity,
                        record.totalQuantity,
                      )
                    }}
                  </div>
                </template>
                <template v-else-if="column.key === 'teams'">
                  <div v-if="record.teams?.length" class="team-tag-list">
                    <Tag
                      v-for="team in record.teams"
                      :key="`${record.id}-${team}`"
                      color="blue"
                    >
                      {{ team }}
                    </Tag>
                  </div>
                  <span v-else class="text-gray-400">-</span>
                </template>
                <template v-else-if="column.key === 'date'">
                  {{ formatDate(record.date) }}
                </template>
              </template>
            </Table>
          </div>
        </Tabs.TabPane>
      </Tabs>
    </div>

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
        <Form.Item label="附件/图片">
          <Upload
            v-model:file-list="requirementForm.attachments"
            action="/api/upload"
            :headers="uploadHeaders"
            :multiple="true"
            list-type="picture-card"
            name="file"
            @change="handleAttachmentUploadChange"
          >
            <div>
              <span class="i-lucide-plus text-xl"></span>
              <div class="mt-2">上传附件</div>
            </div>
          </Upload>
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
  </Drawer>
</template>

<style scoped>
.aggregate-layout {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.summary-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  background: linear-gradient(135deg, #f8fafc 0%, #eff6ff 100%);
  border: 1px solid #e5e7eb;
  border-radius: 12px;
}

.summary-strip__main {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  font-size: 15px;
  font-weight: 600;
  color: #111827;
}

.summary-strip__code {
  font-size: 18px;
  font-weight: 700;
}

.summary-strip__sep {
  color: #9ca3af;
}

.summary-strip__status {
  padding: 2px 10px;
  font-size: 12px;
  font-weight: 700;
  color: #166534;
  background: #dcfce7;
  border-radius: 999px;
}

.summary-strip__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  font-size: 13px;
  color: #4b5563;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.metric-card {
  padding: 16px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 14px;
}

.metric-card__label {
  margin-bottom: 10px;
  font-size: 13px;
  color: #6b7280;
}

.metric-card__value {
  font-size: 32px;
  font-weight: 800;
  line-height: 1;
}

.metric-card--blue .metric-card__value {
  color: #2563eb;
}

.metric-card--green .metric-card__value {
  color: #16a34a;
}

.metric-card--amber .metric-card__value {
  color: #d97706;
}

.metric-card--red .metric-card__value {
  color: #dc2626;
}

.summary-alert {
  border-radius: 12px;
}

.risk-panel {
  padding: 14px 16px;
  background: #fff7f7;
  border: 1px solid #fecaca;
  border-radius: 12px;
}

.risk-panel__title {
  margin-bottom: 8px;
  font-size: 13px;
  font-weight: 700;
  color: #b91c1c;
}

.risk-panel__item {
  font-size: 13px;
  color: #7f1d1d;
}

.tab-toolbar {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 12px;
}

.aggregate-table :deep(.ant-table-cell) {
  white-space: nowrap;
}

.attachment-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-width: 120px;
}

.attachment-link {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  color: #2563eb;
  white-space: nowrap;
  text-decoration: underline;
}

.progress-stats {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}

.progress-stat {
  padding: 14px 16px;
  background: #fafafa;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
}

.progress-stat__label {
  margin-bottom: 8px;
  font-size: 13px;
  color: #6b7280;
}

.progress-stat__value {
  font-size: 28px;
  font-weight: 800;
  color: #111827;
}

.progress-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.progress-card {
  padding: 14px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
}

.progress-card__title {
  margin-bottom: 10px;
  font-size: 14px;
  font-weight: 700;
  color: #111827;
}

.process-tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.coverage-progress {
  font-weight: 700;
  color: #111827;
}

.team-tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.process-progress-table :deep(.ant-table-cell:first-child) {
  min-width: 150px;
}

.process-progress-table :deep(.ant-table-cell) {
  vertical-align: top;
}

@media (max-width: 960px) {
  .stats-grid,
  .progress-stats,
  .progress-grid {
    grid-template-columns: 1fr;
  }
}
</style>
