<script lang="ts" setup>
import type {
  InspectionMaterialRequest,
  MaterialRequestStatus,
} from '#/api/qms/inspection-request';

import { computed, onMounted, reactive, ref } from 'vue';

import { useAccess } from '@vben/access';
import { Page } from '@vben/common-ui';

import {
  Alert,
  Button,
  Form,
  Input,
  message,
  Modal,
  Select,
  Space,
  Table,
  Tag,
} from 'ant-design-vue';

import {
  approveInspectionMaterialRequest,
  getInspectionMaterialRequests,
  rejectInspectionMaterialRequest,
} from '#/api/qms/inspection-request';
import { getPartMasterOptionsApi } from '#/api/system/part-master';
import { useErrorHandler } from '#/hooks/useErrorHandler';

defineOptions({ name: 'QMSInspectionMaterialRequests' });

type ReviewDecision = 'APPROVE' | 'REJECT';
type ApprovalMode = 'CREATE' | 'LINK_EXISTING';

const { hasAccessByCodes, hasAccessByRoles } = useAccess();
const { handleApiError } = useErrorHandler();
const canApprove = computed(
  () =>
    hasAccessByCodes(['QMS:Inspection:MaterialRequests:Approve']) ||
    hasAccessByRoles(['super', 'admin']),
);
const canReject = computed(
  () =>
    hasAccessByCodes(['QMS:Inspection:MaterialRequests:Reject']) ||
    hasAccessByRoles(['super', 'admin']),
);
const loading = ref(false);
const saving = ref(false);
const items = ref<InspectionMaterialRequest[]>([]);
const total = ref(0);
const query = reactive<{
  keyword: string;
  page: number;
  pageSize: number;
  status?: MaterialRequestStatus;
}>({
  keyword: '',
  page: 1,
  pageSize: 20,
  status: 'PENDING',
});

const reviewOpen = ref(false);
const current = ref<InspectionMaterialRequest>();
const reviewDraft = reactive({
  decision: 'APPROVE' as ReviewDecision,
  mode: 'LINK_EXISTING' as ApprovalMode,
  name: '',
  partId: '',
  remark: '',
});
const partOptions = ref<Array<{ label: string; value: string }>>([]);
const partOptionsLoading = ref(false);
let partSearchSequence = 0;

const columns = [
  { dataIndex: 'status', key: 'status', title: '状态', width: 110 },
  {
    dataIndex: 'requestedName',
    key: 'requestedName',
    title: '申请物料',
    width: 220,
  },
  { dataIndex: 'requestNo', key: 'requestNo', title: '报检单号', width: 170 },
  {
    dataIndex: 'workOrderNumber',
    key: 'workOrderNumber',
    title: '工单号',
    width: 170,
  },
  { dataIndex: 'supplierName', key: 'supplierName', title: '供应商' },
  { dataIndex: 'reporter', key: 'reporter', title: '报检人', width: 130 },
  {
    dataIndex: 'submittedAt',
    key: 'submittedAt',
    title: '提交时间',
    width: 180,
  },
  { key: 'resolution', title: '处理结果', width: 220 },
  { key: 'actions', title: '操作', fixed: 'right' as const, width: 150 },
];

function statusLabel(status: MaterialRequestStatus) {
  if (status === 'APPROVED') return '已通过';
  if (status === 'REJECTED') return '已驳回';
  return '待审核';
}

function statusColor(status: MaterialRequestStatus) {
  if (status === 'APPROVED') return 'success';
  if (status === 'REJECTED') return 'error';
  return 'warning';
}

function formatDateTime(value?: null | string) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

async function load() {
  loading.value = true;
  try {
    const result = await getInspectionMaterialRequests({
      keyword: query.keyword.trim() || undefined,
      page: query.page,
      pageSize: query.pageSize,
      status: query.status,
    });
    items.value = result.items;
    total.value = result.total;
  } catch (error: unknown) {
    handleApiError(error, '加载物料申请');
  } finally {
    loading.value = false;
  }
}

async function searchPartOptions(keyword = '') {
  const sequence = ++partSearchSequence;
  const normalizedKeyword = keyword.trim();
  if (!normalizedKeyword) {
    partOptions.value = [];
    partOptionsLoading.value = false;
    return;
  }
  partOptionsLoading.value = true;
  try {
    const result = await getPartMasterOptionsApi({
      keyword: normalizedKeyword,
      take: 20,
    });
    if (sequence !== partSearchSequence) return;
    partOptions.value = result.map((item) => ({
      label: item.name,
      value: item.id,
    }));
  } catch (error: unknown) {
    if (sequence !== partSearchSequence) return;
    partOptions.value = [];
    handleApiError(error, '搜索物料主数据');
  } finally {
    if (sequence === partSearchSequence) {
      partOptionsLoading.value = false;
    }
  }
}

function openReview(
  record: InspectionMaterialRequest,
  decision: ReviewDecision,
) {
  current.value = record;
  Object.assign(reviewDraft, {
    decision,
    mode: 'LINK_EXISTING',
    name: record.requestedName,
    partId: '',
    remark: '',
  });
  reviewOpen.value = true;
  if (decision === 'APPROVE') void searchPartOptions(record.requestedName);
}

function openReviewById(id: unknown, decision: ReviewDecision) {
  const record = items.value.find((item) => item.id === String(id || ''));
  if (record) openReview(record, decision);
}

async function submitReview() {
  if (!current.value) return;
  if (reviewDraft.decision === 'REJECT') {
    if (!reviewDraft.remark.trim()) {
      message.warning('请填写驳回原因');
      return;
    }
  } else if (
    (reviewDraft.mode === 'LINK_EXISTING' && !reviewDraft.partId) ||
    (reviewDraft.mode === 'CREATE' && !reviewDraft.name.trim())
  ) {
    message.warning(
      reviewDraft.mode === 'CREATE' ? '请输入规范物料名称' : '请选择已有物料',
    );
    return;
  }

  saving.value = true;
  try {
    if (reviewDraft.decision === 'REJECT') {
      await rejectInspectionMaterialRequest(current.value.id, {
        remark: reviewDraft.remark.trim(),
      });
      message.success('物料申请已驳回');
    } else if (reviewDraft.mode === 'CREATE') {
      await approveInspectionMaterialRequest(current.value.id, {
        mode: 'CREATE',
        name: reviewDraft.name.trim(),
        remark: reviewDraft.remark.trim() || undefined,
      });
      message.success('已创建规范物料并通过申请');
    } else {
      await approveInspectionMaterialRequest(current.value.id, {
        mode: 'LINK_EXISTING',
        partId: reviewDraft.partId,
        remark: reviewDraft.remark.trim() || undefined,
      });
      message.success('已关联已有物料并通过申请');
    }
    reviewOpen.value = false;
    await load();
  } catch (error: unknown) {
    handleApiError(error, '审核物料申请');
  } finally {
    saving.value = false;
  }
}

function handleTableChange(pagination: {
  current?: number;
  pageSize?: number;
}) {
  query.page = pagination.current || 1;
  query.pageSize = pagination.pageSize || 20;
  void load();
}

function resetFilters() {
  query.keyword = '';
  query.page = 1;
  query.status = 'PENDING';
  void load();
}

onMounted(load);
</script>

<template>
  <Page title="物料申请">
    <Alert
      class="mb-4"
      message="新物料需审核创建或关联规范物料后，对应报检任务才可派单。"
      show-icon
      type="info"
    />

    <Space class="mb-4" wrap>
      <Select
        v-model:value="query.status"
        :options="[
          { label: '待审核', value: 'PENDING' },
          { label: '已通过', value: 'APPROVED' },
          { label: '已驳回', value: 'REJECTED' },
        ]"
        allow-clear
        placeholder="全部状态"
        style="width: 150px"
        @change="
          query.page = 1;
          load();
        "
      />
      <Input.Search
        v-model:value="query.keyword"
        allow-clear
        placeholder="搜索物料、报检单号、工单号或报检人"
        style="width: 320px"
        @search="
          query.page = 1;
          load();
        "
      />
      <Button @click="resetFilters">重置</Button>
    </Space>

    <Table
      :columns="columns"
      :data-source="items"
      :loading="loading"
      :pagination="{
        current: query.page,
        pageSize: query.pageSize,
        showSizeChanger: true,
        total,
      }"
      row-key="id"
      :scroll="{ x: 1450 }"
      @change="handleTableChange"
    >
      <template #bodyCell="{ column, record }">
        <Tag v-if="column.key === 'status'" :color="statusColor(record.status)">
          {{ statusLabel(record.status) }}
        </Tag>
        <span v-else-if="column.key === 'submittedAt'">
          {{ formatDateTime(record.submittedAt) }}
        </span>
        <div v-else-if="column.key === 'resolution'">
          <div>{{ record.resolvedPartName || '—' }}</div>
          <div
            v-if="record.resolvedPartId"
            class="font-mono text-xs text-gray-500"
          >
            {{ record.resolvedPartId }}
          </div>
          <div v-if="record.reviewRemark" class="text-xs text-gray-500">
            {{ record.reviewRemark }}
          </div>
        </div>
        <Space v-else-if="column.key === 'actions'" size="small">
          <template v-if="record.status === 'PENDING'">
            <Button
              v-if="canApprove"
              size="small"
              type="link"
              @click="openReviewById(record.id, 'APPROVE')"
            >
              审核
            </Button>
            <Button
              v-if="canReject"
              danger
              size="small"
              type="link"
              @click="openReviewById(record.id, 'REJECT')"
            >
              驳回
            </Button>
          </template>
          <span v-else>—</span>
        </Space>
      </template>
    </Table>

    <Modal
      v-model:open="reviewOpen"
      :confirm-loading="saving"
      :ok-button-props="{
        danger: reviewDraft.decision === 'REJECT',
      }"
      :ok-text="reviewDraft.decision === 'REJECT' ? '驳回' : '通过'"
      :title="
        reviewDraft.decision === 'REJECT' ? '驳回物料申请' : '审核物料申请'
      "
      @ok="submitReview"
    >
      <Alert
        class="mb-4"
        :message="current?.requestedName || '未填写申请物料名称'"
        show-icon
        type="warning"
      />
      <Form layout="vertical">
        <template v-if="reviewDraft.decision === 'APPROVE'">
          <Form.Item label="处理方式" required>
            <Select
              v-model:value="reviewDraft.mode"
              :options="[
                { label: '关联已有物料', value: 'LINK_EXISTING' },
                { label: '创建规范物料', value: 'CREATE' },
              ]"
            />
          </Form.Item>
          <Form.Item
            v-if="reviewDraft.mode === 'LINK_EXISTING'"
            label="已有物料"
            required
          >
            <Select
              v-model:value="reviewDraft.partId"
              :filter-option="false"
              :loading="partOptionsLoading"
              :options="partOptions"
              placeholder="搜索已启用物料"
              show-search
              @search="searchPartOptions"
            />
          </Form.Item>
          <Form.Item v-else label="规范物料名称" required>
            <Input v-model:value="reviewDraft.name" :maxlength="100" />
          </Form.Item>
        </template>
        <Form.Item
          :label="reviewDraft.decision === 'REJECT' ? '驳回原因' : '审核备注'"
          :required="reviewDraft.decision === 'REJECT'"
        >
          <Input.TextArea
            v-model:value="reviewDraft.remark"
            :rows="3"
            :maxlength="500"
          />
        </Form.Item>
      </Form>
    </Modal>
  </Page>
</template>
