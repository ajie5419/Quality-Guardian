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
  { dataIndex: 'status', key: 'status', title: 'Status', width: 110 },
  { dataIndex: 'entityType', key: 'entityType', title: 'Entity', width: 150 },
  { dataIndex: 'entityId', key: 'entityId', title: 'Record ID', width: 210 },
  { dataIndex: 'fieldName', key: 'fieldName', title: 'Field', width: 190 },
  { dataIndex: 'rawName', key: 'rawName', title: 'Original value' },
  { dataIndex: 'reason', key: 'reason', title: 'Reason', width: 210 },
  { key: 'actions', title: 'Actions', width: 110 },
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
    message.error('Failed to load master data references');
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
    message.error('Failed to load classification options');
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
    message.warning('Select both classification levels');
    return;
  }
  saving.value = true;
  try {
    await resolveMasterDataReferenceApi(current.value.id, draft);
    message.success('Reference resolved');
    modalOpen.value = false;
    await load();
  } catch {
    message.error('Failed to resolve reference');
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
  <Page title="Master Data Governance">
    <Alert
      class="mb-4"
      message="Statistics keep unresolved records visible. Resolve supported classification references here after confirming the correct master data."
      show-icon
      type="info"
    />

    <Space class="mb-4" wrap>
      <Select
        v-model:value="query.status"
        :options="[
          { label: 'Open', value: 'OPEN' },
          { label: 'Resolved', value: 'RESOLVED' },
          { label: 'Ignored', value: 'IGNORED' },
        ]"
        style="width: 140px"
        @change="
          query.page = 1;
          load();
        "
      />
      <Input
        v-model:value="query.entityType"
        allow-clear
        placeholder="Entity type"
        style="width: 180px"
        @press-enter="load"
      />
      <Input
        v-model:value="query.fieldName"
        allow-clear
        placeholder="Field name"
        style="width: 190px"
        @press-enter="load"
      />
      <Button type="primary" @click="load">Search</Button>
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
          {{ record.status }}
        </Tag>
        <span v-else-if="column.key === 'rawName'">
          {{ record.rawName || record.rawId || '—' }}
        </span>
        <Button
          v-else-if="column.key === 'actions' && canResolveById(record.id)"
          size="small"
          type="link"
          @click="openResolutionById(record.id)"
        >
          Resolve
        </Button>
        <span v-else-if="column.key === 'actions'">—</span>
      </template>
    </Table>

    <Modal
      v-model:open="modalOpen"
      :confirm-loading="saving"
      title="Resolve classification reference"
      @ok="saveResolution"
    >
      <Alert
        class="mb-4"
        :message="current?.rawName || current?.rawId || 'No original value'"
        show-icon
        type="warning"
      />
      <Form layout="vertical">
        <Form.Item label="Primary classification" required>
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
        <Form.Item label="Secondary classification" required>
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
        <Form.Item label="Resolution note">
          <Input.TextArea v-model:value="draft.note" :rows="3" />
        </Form.Item>
      </Form>
    </Modal>
  </Page>
</template>
