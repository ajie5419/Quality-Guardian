<script lang="ts" setup>
import type { PartMasterItem } from '#/api/system/part-master';

import { computed, onMounted, reactive, ref } from 'vue';

import { useAccess } from '@vben/access';
import { Page } from '@vben/common-ui';

import {
  Alert,
  Button,
  Form,
  Input,
  InputNumber,
  message,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tag,
} from 'ant-design-vue';

import {
  createPartMasterApi,
  deletePartMasterApi,
  getPartMasterListApi,
  updatePartMasterApi,
} from '#/api/system/part-master';
import { useErrorHandler } from '#/hooks/useErrorHandler';

defineOptions({ name: 'SystemPartMaster' });

const { hasAccessByCodes, hasAccessByRoles } = useAccess();
const { handleApiError } = useErrorHandler();
const canEdit = computed(
  () =>
    hasAccessByCodes(['System:PartMaster:Edit']) ||
    hasAccessByRoles(['super', 'admin']),
);

const loading = ref(false);
const saving = ref(false);
const items = ref<PartMasterItem[]>([]);
const total = ref(0);
const query = reactive<{
  keyword: string;
  page: number;
  pageSize: number;
  status?: 0 | 1;
}>({
  keyword: '',
  page: 1,
  pageSize: 20,
});
const modalOpen = ref(false);
const editingId = ref<null | string>(null);
const draft = reactive({
  name: '',
  sort: 0,
});

const columns = [
  { dataIndex: 'name', key: 'name', title: 'Material name' },
  { dataIndex: 'sort', key: 'sort', title: 'Sort order', width: 120 },
  { key: 'status', title: 'Enabled', width: 110 },
  { key: 'actions', title: 'Actions', width: 160 },
];

async function load() {
  loading.value = true;
  try {
    const result = await getPartMasterListApi({
      keyword: query.keyword.trim() || undefined,
      page: query.page,
      pageSize: query.pageSize,
      status: query.status,
    });
    items.value = result.items;
    total.value = result.total;
  } catch (error: unknown) {
    handleApiError(error, 'Load Material Master');
  } finally {
    loading.value = false;
  }
}

function openCreate() {
  editingId.value = null;
  Object.assign(draft, { name: '', sort: 0 });
  modalOpen.value = true;
}

function openEdit(item: PartMasterItem) {
  editingId.value = item.id;
  Object.assign(draft, { name: item.name, sort: item.sort });
  modalOpen.value = true;
}

async function save() {
  const name = draft.name.trim();
  if (!name) {
    message.warning('Material name is required');
    return;
  }
  saving.value = true;
  try {
    if (editingId.value) {
      await updatePartMasterApi(editingId.value, {
        name,
        sort: draft.sort,
      });
      message.success('Material updated');
    } else {
      await createPartMasterApi({ name, sort: draft.sort });
      message.success('Material created');
    }
    modalOpen.value = false;
    await load();
  } catch (error: unknown) {
    handleApiError(error, 'Save Material Master');
  } finally {
    saving.value = false;
  }
}

async function toggleStatus(item: PartMasterItem, checked: boolean) {
  const previous = item.status;
  item.status = checked ? 1 : 0;
  try {
    await updatePartMasterApi(item.id, { status: item.status });
    message.success(checked ? 'Material enabled' : 'Material disabled');
  } catch (error: unknown) {
    item.status = previous;
    handleApiError(error, 'Update Material Status');
  }
}

function openEditById(id: unknown) {
  const item = items.value.find((record) => record.id === String(id || ''));
  if (item) openEdit(item);
}

async function toggleStatusById(id: unknown, checked: boolean) {
  const item = items.value.find((record) => record.id === String(id || ''));
  if (item) await toggleStatus(item, checked);
}

async function remove(item: PartMasterItem) {
  try {
    await deletePartMasterApi(item.id);
    message.success('Material deleted');
    await load();
  } catch (error: unknown) {
    handleApiError(error, 'Delete Material');
  }
}

async function removeById(id: unknown) {
  const item = items.value.find((record) => record.id === String(id || ''));
  if (item) await remove(item);
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
  query.status = undefined;
  void load();
}

onMounted(load);
</script>

<template>
  <Page title="Material Master">
    <Alert
      v-if="!canEdit"
      class="mb-4"
      message="You have read-only access to material master data."
      show-icon
      type="info"
    />

    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <Space wrap>
        <Input.Search
          v-model:value="query.keyword"
          allow-clear
          placeholder="Search material name"
          style="width: 280px"
          @search="
            query.page = 1;
            load();
          "
        />
        <Select
          v-model:value="query.status"
          :options="[
            { label: 'Enabled', value: 1 },
            { label: 'Disabled', value: 0 },
          ]"
          allow-clear
          placeholder="All statuses"
          style="width: 150px"
          @change="
            query.page = 1;
            load();
          "
        />
        <Button @click="resetFilters">Reset</Button>
      </Space>
      <Button :disabled="!canEdit" type="primary" @click="openCreate">
        Add material
      </Button>
    </div>

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
      @change="handleTableChange"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'status'">
          <Switch
            v-if="canEdit"
            :checked="record.status === 1"
            @change="
              (checked) =>
                toggleStatusById(
                  record.id,
                  typeof checked === 'boolean' ? checked : false,
                )
            "
          />
          <Tag v-else :color="record.status === 1 ? 'success' : 'default'">
            {{ record.status === 1 ? 'Enabled' : 'Disabled' }}
          </Tag>
        </template>
        <Space v-else-if="column.key === 'actions'">
          <Button
            :disabled="!canEdit"
            size="small"
            type="link"
            @click="openEditById(record.id)"
          >
            Edit
          </Button>
          <Popconfirm
            title="Delete this material?"
            ok-text="Delete"
            @confirm="removeById(record.id)"
          >
            <Button :disabled="!canEdit" danger size="small" type="link">
              Delete
            </Button>
          </Popconfirm>
        </Space>
      </template>
    </Table>

    <Modal
      v-model:open="modalOpen"
      :confirm-loading="saving"
      :title="editingId ? 'Edit material' : 'Add material'"
      @ok="save"
    >
      <Form layout="vertical">
        <Form.Item label="Material name" required>
          <Input v-model:value="draft.name" :maxlength="100" />
        </Form.Item>
        <Form.Item label="Sort order">
          <InputNumber
            v-model:value="draft.sort"
            :min="0"
            :precision="0"
            class="w-full"
          />
        </Form.Item>
      </Form>
    </Modal>
  </Page>
</template>
