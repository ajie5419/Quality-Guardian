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
  { dataIndex: 'name', key: 'name', title: '物料名称' },
  { dataIndex: 'sort', key: 'sort', title: '排序', width: 120 },
  { key: 'status', title: '启用状态', width: 110 },
  { key: 'actions', title: '操作', width: 160 },
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
    handleApiError(error, '加载物料主数据');
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
    message.warning('请输入物料名称');
    return;
  }
  saving.value = true;
  try {
    if (editingId.value) {
      await updatePartMasterApi(editingId.value, {
        name,
        sort: draft.sort,
      });
      message.success('物料已更新');
    } else {
      await createPartMasterApi({ name, sort: draft.sort });
      message.success('物料已创建');
    }
    modalOpen.value = false;
    await load();
  } catch (error: unknown) {
    handleApiError(error, '保存物料主数据');
  } finally {
    saving.value = false;
  }
}

async function toggleStatus(item: PartMasterItem, checked: boolean) {
  const previous = item.status;
  item.status = checked ? 1 : 0;
  try {
    await updatePartMasterApi(item.id, { status: item.status });
    message.success(checked ? '物料已启用' : '物料已停用');
  } catch (error: unknown) {
    item.status = previous;
    handleApiError(error, '更新物料状态');
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
    message.success('物料已删除');
    await load();
  } catch (error: unknown) {
    handleApiError(error, '删除物料');
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
  <Page title="物料主数据">
    <Alert
      v-if="!canEdit"
      class="mb-4"
      message="当前账号仅可查看物料主数据。"
      show-icon
      type="info"
    />

    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <Space wrap>
        <Input.Search
          v-model:value="query.keyword"
          allow-clear
          placeholder="搜索物料名称"
          style="width: 280px"
          @search="
            query.page = 1;
            load();
          "
        />
        <Select
          v-model:value="query.status"
          :options="[
            { label: '已启用', value: 1 },
            { label: '已停用', value: 0 },
          ]"
          allow-clear
          placeholder="全部状态"
          style="width: 150px"
          @change="
            query.page = 1;
            load();
          "
        />
        <Button @click="resetFilters">重置</Button>
      </Space>
      <Button :disabled="!canEdit" type="primary" @click="openCreate">
        新增物料
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
            {{ record.status === 1 ? '已启用' : '已停用' }}
          </Tag>
        </template>
        <Space v-else-if="column.key === 'actions'">
          <Button
            :disabled="!canEdit"
            size="small"
            type="link"
            @click="openEditById(record.id)"
          >
            编辑
          </Button>
          <Popconfirm
            title="确认删除该物料？"
            ok-text="删除"
            @confirm="removeById(record.id)"
          >
            <Button :disabled="!canEdit" danger size="small" type="link">
              删除
            </Button>
          </Popconfirm>
        </Space>
      </template>
    </Table>

    <Modal
      v-model:open="modalOpen"
      :confirm-loading="saving"
      :title="editingId ? '编辑物料' : '新增物料'"
      @ok="save"
    >
      <Form layout="vertical">
        <Form.Item label="物料名称" required>
          <Input v-model:value="draft.name" :maxlength="100" />
        </Form.Item>
        <Form.Item label="排序">
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
