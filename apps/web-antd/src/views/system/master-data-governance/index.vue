<script lang="ts" setup>
import type {
  QualityClassificationCategory,
  QualityClassificationScope,
} from '@qgs/shared';

import type { MasterDataGovernanceApi } from '#/api/system/master-data-governance';

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

import { getQualityClassificationOptionsApi } from '#/api/qms/quality-classification';
import {
  getMasterDataReferencesApi,
  resolveMasterDataReferenceApi,
} from '#/api/system/master-data-governance';

import {
  getGovernanceEntityLabel,
  getGovernanceFieldLabel,
  getGovernanceReasonLabel,
  getGovernanceStatusLabel,
  governanceEntityOptions,
  governanceFieldOptions,
} from './governance-labels';

type Reference = MasterDataGovernanceApi.Reference;
type Scope = QualityClassificationScope;

const { hasAccessByCodes, hasAccessByRoles } = useAccess();
const canEdit = computed(
  () =>
    hasAccessByCodes(['System:MasterDataGovernance:Edit']) ||
    hasAccessByRoles(['super', 'admin']),
);

const loading = ref(false);
const saving = ref(false);
const items = ref<Reference[]>([]);
const total = ref(0);
const query = reactive<MasterDataGovernanceApi.Query>({
  page: 1,
  pageSize: 20,
  status: 'OPEN',
});

const modalOpen = ref(false);
const current = ref<null | Reference>(null);
const categories = ref<QualityClassificationCategory[]>([]);
const draft = reactive({
  categoryId: '',
  note: '',
  subcategoryId: '',
});

const selectedCategory = computed(() =>
  categories.value.find((item) => item.id === draft.categoryId),
);

const columns = [
  { dataIndex: 'status', key: 'status', title: '状态', width: 110 },
  { dataIndex: 'entityType', key: 'entityType', title: '业务类型', width: 150 },
  { dataIndex: 'entityId', key: 'entityId', title: '记录编号', width: 210 },
  { dataIndex: 'fieldName', key: 'fieldName', title: '治理字段', width: 190 },
  { dataIndex: 'rawName', key: 'rawName', title: '原始值' },
  { dataIndex: 'reason', key: 'reason', title: '待治理原因', width: 240 },
  { key: 'actions', title: '操作', width: 110 },
];

function classificationScope(record: Reference): null | Scope {
  if (
    record.entityType === 'quality_records' &&
    record.fieldName === 'defectClassification'
  ) {
    return 'INSPECTION_ISSUE_DEFECT';
  }
  if (
    record.entityType === 'after_sales' &&
    record.fieldName === 'defectClassification'
  ) {
    return 'AFTER_SALES_DEFECT';
  }
  if (
    record.entityType === 'after_sales' &&
    record.fieldName === 'productClassification'
  ) {
    return 'AFTER_SALES_PRODUCT';
  }
  return null;
}

function canResolve(record: Reference) {
  return (
    canEdit.value &&
    record.status === 'OPEN' &&
    classificationScope(record) !== null
  );
}

function canResolveById(id: unknown) {
  const record = items.value.find((item) => item.id === String(id || ''));
  return record ? canResolve(record) : false;
}

async function load() {
  loading.value = true;
  try {
    const result = await getMasterDataReferencesApi(query);
    items.value = result.items;
    total.value = result.total;
  } catch {
    message.error('主数据治理记录加载失败');
  } finally {
    loading.value = false;
  }
}

async function openResolution(record: Reference) {
  const scope = classificationScope(record);
  if (!scope) return;
  current.value = record;
  Object.assign(draft, {
    categoryId: '',
    note: '',
    subcategoryId: '',
  });
  try {
    categories.value = await getQualityClassificationOptionsApi(scope);
    modalOpen.value = true;
  } catch {
    message.error('分类选项加载失败');
  }
}

function openResolutionById(id: unknown) {
  const record = items.value.find((item) => item.id === String(id || ''));
  if (record) void openResolution(record);
}

function handleCategoryChange() {
  draft.subcategoryId = '';
}

async function saveResolution() {
  if (!current.value || !draft.categoryId || !draft.subcategoryId) {
    message.warning('请选择一级和二级分类');
    return;
  }
  saving.value = true;
  try {
    const result = await resolveMasterDataReferenceApi(current.value.id, draft);
    message.success(
      `已批量更新 ${result.affectedCount} 条业务记录，解决 ${result.resolvedAuditCount} 个治理项`,
    );
    modalOpen.value = false;
    await load();
  } catch {
    message.error('治理项处置失败');
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
  query.entityType = undefined;
  query.fieldName = undefined;
  query.page = 1;
  query.status = 'OPEN';
  void load();
}

onMounted(load);
</script>

<template>
  <Page title="主数据治理">
    <Alert
      class="mb-4"
      message="未解析数据会持续显示在业务统计中。请核对原始值后，在此关联正确的主数据。"
      show-icon
      type="info"
    />

    <Space class="mb-4" wrap>
      <Select
        v-model:value="query.status"
        :options="[
          { label: '待处置', value: 'OPEN' },
          { label: '已解决', value: 'RESOLVED' },
          { label: '已忽略', value: 'IGNORED' },
        ]"
        style="width: 140px"
        @change="
          query.page = 1;
          load();
        "
      />
      <Select
        v-model:value="query.entityType"
        :options="governanceEntityOptions"
        allow-clear
        placeholder="业务类型"
        show-search
        style="width: 180px"
      />
      <Select
        v-model:value="query.fieldName"
        :options="governanceFieldOptions"
        allow-clear
        placeholder="治理字段"
        show-search
        style="width: 190px"
      />
      <Button type="primary" @click="load">查询</Button>
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
      :scroll="{ x: 1200 }"
      @change="handleTableChange"
    >
      <template #bodyCell="{ column, record }">
        <Tag
          v-if="column.key === 'status'"
          :color="
            record.status === 'OPEN'
              ? 'orange'
              : record.status === 'RESOLVED'
                ? 'green'
                : 'default'
          "
        >
          {{ getGovernanceStatusLabel(record.status) }}
        </Tag>
        <span v-else-if="column.key === 'entityType'">
          {{ getGovernanceEntityLabel(record.entityType) }}
        </span>
        <span v-else-if="column.key === 'fieldName'">
          {{ getGovernanceFieldLabel(record.fieldName) }}
        </span>
        <span v-else-if="column.key === 'rawName'">
          {{ record.rawName || record.rawId || '—' }}
        </span>
        <span v-else-if="column.key === 'reason'">
          {{ getGovernanceReasonLabel(record.reason) }}
        </span>
        <Button
          v-else-if="column.key === 'actions' && canResolveById(record.id)"
          size="small"
          type="link"
          @click="openResolutionById(record.id)"
        >
          处置
        </Button>
        <span v-else-if="column.key === 'actions'">—</span>
      </template>
    </Table>

    <Modal
      v-model:open="modalOpen"
      :confirm-loading="saving"
      title="处置分类治理项"
      @ok="saveResolution"
    >
      <Alert
        class="mb-4"
        :message="current?.rawName || current?.rawId || '无原始值'"
        description="确认后，系统会一次处置业务类型、治理字段和原始值都相同的全部记录。"
        show-icon
        type="warning"
      />
      <Form layout="vertical">
        <Form.Item label="一级分类" required>
          <Select
            v-model:value="draft.categoryId"
            :options="
              categories.map((item) => ({
                label: item.name,
                value: item.id,
              }))
            "
            @change="handleCategoryChange"
          />
        </Form.Item>
        <Form.Item label="二级分类" required>
          <Select
            v-model:value="draft.subcategoryId"
            :disabled="!draft.categoryId"
            :options="
              (selectedCategory?.subcategories || []).map((item) => ({
                label: item.name,
                value: item.id,
              }))
            "
          />
        </Form.Item>
        <Form.Item label="处置备注">
          <Input.TextArea v-model:value="draft.note" :rows="3" />
        </Form.Item>
      </Form>
    </Modal>
  </Page>
</template>
