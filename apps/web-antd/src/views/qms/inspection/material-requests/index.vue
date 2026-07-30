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
  { dataIndex: 'status', key: 'status', title: 'Status', width: 110 },
  {
    dataIndex: 'requestedName',
    key: 'requestedName',
    title: 'Requested material',
    width: 220,
  },
  { dataIndex: 'requestNo', key: 'requestNo', title: 'Request', width: 170 },
  {
    dataIndex: 'workOrderNumber',
    key: 'workOrderNumber',
    title: 'Work order',
    width: 170,
  },
  { dataIndex: 'supplierName', key: 'supplierName', title: 'Supplier' },
  { dataIndex: 'reporter', key: 'reporter', title: 'Reporter', width: 130 },
  {
    dataIndex: 'submittedAt',
    key: 'submittedAt',
    title: 'Submitted',
    width: 180,
  },
  { key: 'resolution', title: 'Resolution', width: 220 },
  { key: 'actions', title: 'Actions', fixed: 'right' as const, width: 150 },
];

function statusColor(status: MaterialRequestStatus) {
  if (status === 'APPROVED') return 'success';
  if (status === 'REJECTED') return 'error';
  return 'warning';
}

function formatDateTime(value?: null | string) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-GB', {
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
    handleApiError(error, 'Load Material Requests');
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
    handleApiError(error, 'Search Material Master');
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
      message.warning('A rejection reason is required');
      return;
    }
  } else if (
    (reviewDraft.mode === 'LINK_EXISTING' && !reviewDraft.partId) ||
    (reviewDraft.mode === 'CREATE' && !reviewDraft.name.trim())
  ) {
    message.warning(
      reviewDraft.mode === 'CREATE'
        ? 'Enter the canonical material name'
        : 'Select an existing material',
    );
    return;
  }

  saving.value = true;
  try {
    if (reviewDraft.decision === 'REJECT') {
      await rejectInspectionMaterialRequest(current.value.id, {
        remark: reviewDraft.remark.trim(),
      });
      message.success('Material request rejected');
    } else if (reviewDraft.mode === 'CREATE') {
      await approveInspectionMaterialRequest(current.value.id, {
        mode: 'CREATE',
        name: reviewDraft.name.trim(),
        remark: reviewDraft.remark.trim() || undefined,
      });
      message.success('Canonical material created and request approved');
    } else {
      await approveInspectionMaterialRequest(current.value.id, {
        mode: 'LINK_EXISTING',
        partId: reviewDraft.partId,
        remark: reviewDraft.remark.trim() || undefined,
      });
      message.success('Request linked to the existing material');
    }
    reviewOpen.value = false;
    await load();
  } catch (error: unknown) {
    handleApiError(error, 'Review Material Request');
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
  <Page title="Material Requests">
    <Alert
      class="mb-4"
      message="Inspection requests remain queued here until a canonical material is created or linked. Approval immediately unblocks dispatch."
      show-icon
      type="info"
    />

    <Space class="mb-4" wrap>
      <Select
        v-model:value="query.status"
        :options="[
          { label: 'Pending', value: 'PENDING' },
          { label: 'Approved', value: 'APPROVED' },
          { label: 'Rejected', value: 'REJECTED' },
        ]"
        allow-clear
        placeholder="All statuses"
        style="width: 150px"
        @change="
          query.page = 1;
          load();
        "
      />
      <Input.Search
        v-model:value="query.keyword"
        allow-clear
        placeholder="Material, request, work order, or reporter"
        style="width: 320px"
        @search="
          query.page = 1;
          load();
        "
      />
      <Button @click="resetFilters">Reset</Button>
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
          {{ record.status }}
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
              Review
            </Button>
            <Button
              v-if="canReject"
              danger
              size="small"
              type="link"
              @click="openReviewById(record.id, 'REJECT')"
            >
              Reject
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
      :ok-text="reviewDraft.decision === 'REJECT' ? 'Reject' : 'Approve'"
      :title="
        reviewDraft.decision === 'REJECT'
          ? 'Reject material request'
          : 'Approve material request'
      "
      @ok="submitReview"
    >
      <Alert
        class="mb-4"
        :message="current?.requestedName || 'No requested name'"
        show-icon
        type="warning"
      />
      <Form layout="vertical">
        <template v-if="reviewDraft.decision === 'APPROVE'">
          <Form.Item label="Resolution" required>
            <Select
              v-model:value="reviewDraft.mode"
              :options="[
                { label: 'Link existing material', value: 'LINK_EXISTING' },
                { label: 'Create canonical material', value: 'CREATE' },
              ]"
            />
          </Form.Item>
          <Form.Item
            v-if="reviewDraft.mode === 'LINK_EXISTING'"
            label="Existing material"
            required
          >
            <Select
              v-model:value="reviewDraft.partId"
              :filter-option="false"
              :loading="partOptionsLoading"
              :options="partOptions"
              placeholder="Search active materials"
              show-search
              @search="searchPartOptions"
            />
          </Form.Item>
          <Form.Item v-else label="Canonical material name" required>
            <Input v-model:value="reviewDraft.name" :maxlength="100" />
          </Form.Item>
        </template>
        <Form.Item
          :label="
            reviewDraft.decision === 'REJECT'
              ? 'Rejection reason'
              : 'Review remark'
          "
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
