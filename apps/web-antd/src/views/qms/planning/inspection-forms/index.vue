<script lang="ts" setup>
import type { InspectionFormTemplateItem } from '#/api/qms/planning';

import { computed, onMounted, ref } from 'vue';

import { useAccess } from '@vben/access';
import { Page } from '@vben/common-ui';

import {
  Button,
  Input,
  message,
  Modal,
  Select,
  Space,
  Table,
  Tag,
} from 'ant-design-vue';

import {
  createInspectionFormTemplate,
  deleteInspectionFormTemplate,
  getInspectionFormTemplateListPage,
  updateInspectionFormTemplate,
} from '#/api/qms/planning';
import { useErrorHandler } from '#/hooks/useErrorHandler';

import TemplateModal from './components/TemplateModal.vue';

type EditableTemplate = {
  attachments?: string;
  formFields?: Array<Record<string, unknown>>;
  formName?: string;
  id: string;
  partName?: string;
  processName?: string;
  projectName?: string;
  status?: 'active' | 'inactive';
  workOrderNumber?: string;
};

const { hasAccessByCodes } = useAccess();
const { handleApiError } = useErrorHandler();

const canCreate = computed(() =>
  hasAccessByCodes(['QMS:Planning:InspectionForm:Create']),
);
const canEdit = computed(() =>
  hasAccessByCodes(['QMS:Planning:InspectionForm:Edit']),
);
const canDelete = computed(() =>
  hasAccessByCodes(['QMS:Planning:InspectionForm:Delete']),
);

const loading = ref(false);
const saving = ref(false);
const modalOpen = ref(false);
const editing = ref<EditableTemplate | null>(null);

const workOrderFilter = ref('');
const processFilter = ref('');
const partFilter = ref('');
const statusFilter = ref<'' | 'active' | 'inactive'>('');

const records = ref<InspectionFormTemplateItem[]>([]);

const filteredRows = computed(() => {
  return records.value.filter((item) => {
    if (statusFilter.value && item.status !== statusFilter.value) {
      return false;
    }
    return true;
  });
});

const columns = [
  { title: '工单号', dataIndex: 'workOrderNumber', width: 150 },
  { title: '项目名称', dataIndex: 'projectName', width: 220 },
  { title: '检验表名称', dataIndex: 'formName', width: 220 },
  { title: '工序/场景', dataIndex: 'processName', width: 160 },
  { title: '部件名称', dataIndex: 'partName', width: 180 },
  { title: '检验项数量', dataIndex: 'fieldsCount', width: 110 },
  { title: '状态', dataIndex: 'status', width: 100 },
  { title: '更新时间', dataIndex: 'updatedAt', width: 180 },
  { title: '操作', dataIndex: 'actions', width: 180, fixed: 'right' as const },
];

function parseFieldCount(item: InspectionFormTemplateItem) {
  try {
    const fields = JSON.parse(String(item.formFields || '[]'));
    return Array.isArray(fields) ? fields.length : 0;
  } catch {
    return 0;
  }
}

function parseFormFields(
  raw: InspectionFormTemplateItem['formFields'],
): Array<Record<string, unknown>> {
  if (Array.isArray(raw)) return raw as Array<Record<string, unknown>>;
  try {
    const parsed = JSON.parse(String(raw || '[]'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function mappedRows() {
  return filteredRows.value.map((item) => ({
    ...item,
    fieldsCount: parseFieldCount(item),
    key: item.id,
  }));
}

async function loadList() {
  loading.value = true;
  try {
    const { items } = await getInspectionFormTemplateListPage({
      partName: partFilter.value || undefined,
      processName: processFilter.value || undefined,
      workOrderNumber: workOrderFilter.value || undefined,
    });
    records.value = items || [];
  } catch (error) {
    handleApiError(error, 'Load Inspection Form Templates');
    records.value = [];
  } finally {
    loading.value = false;
  }
}

function openCreate() {
  editing.value = null;
  modalOpen.value = true;
}

function openEdit(row: InspectionFormTemplateItem) {
  editing.value = {
    attachments: row.attachments,
    formFields: parseFormFields(row.formFields),
    formName: row.formName,
    id: row.id,
    partName: row.partName || '',
    processName: row.processName,
    projectName: row.projectName,
    status: row.status === 'inactive' ? 'inactive' : 'active',
    workOrderNumber: row.workOrderNumber,
  };
  modalOpen.value = true;
}

async function handleDelete(id: string) {
  Modal.confirm({
    title: '确认删除',
    content: '删除后将不会用于检验记录匹配，是否继续？',
    onOk: async () => {
      try {
        await deleteInspectionFormTemplate(id);
        message.success('删除成功');
        await loadList();
      } catch (error) {
        handleApiError(error, 'Delete Inspection Form Template');
      }
    },
  });
}

async function handleSubmit(payload: {
  attachments: string;
  formFields: Array<Record<string, unknown>>;
  formName: string;
  partName?: string;
  processName: string;
  projectName: string;
  status: 'active' | 'inactive';
  workOrderNumber: string;
}) {
  saving.value = true;
  try {
    if (editing.value?.id) {
      await updateInspectionFormTemplate(editing.value.id, payload);
      message.success('更新成功');
    } else {
      await createInspectionFormTemplate(payload);
      message.success('创建成功');
    }
    modalOpen.value = false;
    await loadList();
  } catch (error) {
    handleApiError(
      error,
      editing.value?.id ? 'Update Inspection Form' : 'Create Inspection Form',
    );
  } finally {
    saving.value = false;
  }
}

onMounted(async () => {
  await loadList();
});
</script>

<template>
  <Page auto-content-height>
    <div class="p-3">
      <div class="mb-3 flex items-center justify-between">
        <Space>
          <Input
            v-model:value="workOrderFilter"
            allow-clear
            placeholder="按工单号筛选"
            style="width: 180px"
          />
          <Input
            v-model:value="processFilter"
            allow-clear
            placeholder="按工序/场景筛选"
            style="width: 180px"
          />
          <Input
            v-model:value="partFilter"
            allow-clear
            placeholder="按部件名称筛选"
            style="width: 180px"
          />
          <Select
            v-model:value="statusFilter"
            allow-clear
            placeholder="状态"
            style="width: 140px"
            :options="[
              { label: '启用', value: 'active' },
              { label: '停用', value: 'inactive' },
            ]"
          />
          <Button @click="loadList">查询</Button>
          <Button
            @click="
              () => {
                workOrderFilter = '';
                processFilter = '';
                partFilter = '';
                statusFilter = '';
                loadList();
              }
            "
            >重置</Button
          >
        </Space>
        <Button v-if="canCreate" type="primary" @click="openCreate"
          >新增模板</Button
        >
      </div>

      <Table
        :columns="columns"
        :data-source="mappedRows()"
        :loading="loading"
        :pagination="{ pageSize: 15, showSizeChanger: false }"
        :scroll="{ x: 1200 }"
        bordered
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.dataIndex === 'status'">
            <Tag :color="record.status === 'active' ? 'green' : 'default'">
              {{ record.status === 'active' ? '启用' : '停用' }}
            </Tag>
          </template>
          <template v-if="column.dataIndex === 'updatedAt'">
            {{
              String(record.updatedAt || '')
                .slice(0, 19)
                .replace('T', ' ')
            }}
          </template>
          <template v-if="column.dataIndex === 'actions'">
            <Space>
              <Button
                v-if="canEdit"
                size="small"
                type="link"
                @click="openEdit(record as InspectionFormTemplateItem)"
                >编辑</Button
              >
              <Button
                v-if="canDelete"
                danger
                size="small"
                type="link"
                @click="handleDelete((record as InspectionFormTemplateItem).id)"
                >删除</Button
              >
            </Space>
          </template>
        </template>
      </Table>
    </div>

    <TemplateModal
      :open="modalOpen"
      :saving="saving"
      :current="editing"
      @cancel="modalOpen = false"
      @submit="handleSubmit"
    />
  </Page>
</template>
