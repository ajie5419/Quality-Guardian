<script lang="ts" setup>
import type { QualityClassificationApi } from '#/api/system/quality-classification';

import { computed, onMounted, reactive, ref } from 'vue';

import { useAccess } from '@vben/access';
import { Page } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';
import { useI18n } from '@vben/locales';

import {
  Alert,
  Button,
  Form,
  Input,
  InputNumber,
  message,
  Modal,
  Popconfirm,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
  Tooltip,
} from 'ant-design-vue';

import {
  createQualityCategoryApi,
  createQualitySubcategoryApi,
  deleteQualityCategoryApi,
  deleteQualitySubcategoryApi,
  getQualityClassificationsApi,
  updateQualityCategoryApi,
  updateQualitySubcategoryApi,
} from '#/api/system/quality-classification';

type Category = QualityClassificationApi.Category;
type Scope = QualityClassificationApi.Scope;

interface ClassificationRow {
  children?: ClassificationRow[];
  code: string;
  id: string;
  kind: 'category' | 'subcategory';
  name: string;
  parentId: null | string;
  rowKey: string;
  sort: number;
  status: 0 | 1;
}

const SCOPES = new Set<Scope>([
  'AFTER_SALES_DEFECT',
  'AFTER_SALES_PRODUCT',
  'INSPECTION_ISSUE_DEFECT',
]);

const { t } = useI18n();
const { hasAccessByCodes, hasAccessByRoles } = useAccess();

const canEdit = computed(
  () =>
    hasAccessByCodes(['System:QualityClassification:Edit']) ||
    hasAccessByRoles(['super', 'admin']),
);
const activeScope = ref<Scope>('INSPECTION_ISSUE_DEFECT');
const categories = ref<Category[]>([]);
const expandedRowKeys = ref<string[]>([]);
const loading = ref(false);
const saving = ref(false);
const statusSavingKeys = ref(new Set<string>());
const modalOpen = ref(false);
const editingId = ref<null | string>(null);
const editingKind = ref<'category' | 'subcategory'>('category');
const parentCategory = ref<null | Pick<Category, 'id' | 'name'>>(null);
const draft = reactive<{
  code: string;
  name: string;
  sort: number;
  status: 0 | 1;
}>({
  code: '',
  name: '',
  sort: 0,
  status: 1,
});

const rows = computed<ClassificationRow[]>(() =>
  categories.value.map((category) => {
    const children = category.subcategories.map((subcategory) => ({
      code: subcategory.code,
      id: subcategory.id,
      kind: 'subcategory' as const,
      name: subcategory.name,
      parentId: category.id,
      rowKey: `subcategory:${subcategory.id}`,
      sort: subcategory.sort,
      status: subcategory.status,
    }));
    return {
      ...(children.length > 0 ? { children } : {}),
      code: category.code,
      id: category.id,
      kind: 'category' as const,
      name: category.name,
      parentId: null,
      rowKey: `category:${category.id}`,
      sort: category.sort,
      status: category.status,
    };
  }),
);

const columns = computed(() => [
  {
    key: 'name',
    title: t('sys.qualityClassification.name'),
  },
  {
    dataIndex: 'code',
    key: 'code',
    title: t('sys.qualityClassification.code'),
    width: 190,
  },
  {
    dataIndex: 'sort',
    key: 'sort',
    title: t('sys.qualityClassification.sort'),
    width: 90,
  },
  {
    key: 'status',
    title: t('sys.qualityClassification.enabled'),
    width: 90,
  },
  {
    key: 'actions',
    title: t('common.action'),
    width: 150,
  },
]);

const modalTitle = computed(() => {
  const prefix = editingId.value ? 'edit' : 'add';
  const suffix = editingKind.value === 'category' ? 'Category' : 'Subcategory';
  return t(`sys.qualityClassification.${prefix}${suffix}`);
});

function findCategory(id: string) {
  return categories.value.find((category) => category.id === id);
}

function findRow(record: Record<string, unknown>) {
  const rowKey = typeof record.rowKey === 'string' ? record.rowKey : '';
  return rows.value
    .flatMap((row) => [row, ...(row.children ?? [])])
    .find((row) => row.rowKey === rowKey);
}

function markStatusSaving(rowKey: string, savingStatus: boolean) {
  const next = new Set(statusSavingKeys.value);
  if (savingStatus) next.add(rowKey);
  else next.delete(rowKey);
  statusSavingKeys.value = next;
}

async function loadClassifications() {
  loading.value = true;
  try {
    categories.value = await getQualityClassificationsApi(activeScope.value);
    expandedRowKeys.value = categories.value.map(
      (category) => `category:${category.id}`,
    );
  } catch {
    message.error(t('common.loadFailed'));
  } finally {
    loading.value = false;
  }
}

async function handleScopeChange(scope: number | string) {
  if (typeof scope !== 'string' || !SCOPES.has(scope as Scope)) return;
  activeScope.value = scope as Scope;
  await loadClassifications();
}

function resetDraft(sort: number) {
  Object.assign(draft, {
    code: '',
    name: '',
    sort,
    status: 1,
  });
}

function openCreateCategory() {
  editingId.value = null;
  editingKind.value = 'category';
  parentCategory.value = null;
  resetDraft(categories.value.length);
  modalOpen.value = true;
}

function openCreateSubcategory(category: Category) {
  editingId.value = null;
  editingKind.value = 'subcategory';
  parentCategory.value = { id: category.id, name: category.name };
  resetDraft(category.subcategories.length);
  modalOpen.value = true;
}

function openEdit(row: ClassificationRow) {
  editingId.value = row.id;
  editingKind.value = row.kind;
  parentCategory.value =
    row.kind === 'subcategory' && row.parentId
      ? (findCategory(row.parentId) ?? null)
      : null;
  Object.assign(draft, {
    code: row.code ?? '',
    name: row.name,
    sort: row.sort,
    status: row.status,
  });
  modalOpen.value = true;
}

function openEditRecord(record: Record<string, unknown>) {
  const row = findRow(record);
  if (row) openEdit(row);
}

function openCreateSubcategoryForRecord(record: Record<string, unknown>) {
  const row = findRow(record);
  if (!row || row.kind !== 'category') return;
  const category = findCategory(row.id);
  if (category) openCreateSubcategory(category);
}

async function saveClassification() {
  const name = draft.name.trim();
  const code = draft.code.trim();
  if (!name) {
    message.warning(t('sys.qualityClassification.nameRequired'));
    return;
  }
  if (code && !/^[\w-]+$/.test(code)) {
    message.warning(t('sys.qualityClassification.codeInvalid'));
    return;
  }

  const updatePayload = {
    name,
    sort: draft.sort,
    status: draft.status,
  };
  saving.value = true;
  try {
    if (editingId.value) {
      await (editingKind.value === 'category'
        ? updateQualityCategoryApi(editingId.value, updatePayload)
        : updateQualitySubcategoryApi(editingId.value, updatePayload));
    } else if (editingKind.value === 'category') {
      await createQualityCategoryApi({
        ...updatePayload,
        code: code || null,
        scope: activeScope.value,
      });
    } else if (parentCategory.value) {
      await createQualitySubcategoryApi({
        ...updatePayload,
        categoryId: parentCategory.value.id,
        code: code || null,
      });
    } else {
      message.error(t('sys.qualityClassification.parentMissing'));
      return;
    }
    modalOpen.value = false;
    await loadClassifications();
    message.success(t('common.saveSuccess'));
  } catch {
    message.error(t('common.saveFailed'));
  } finally {
    saving.value = false;
  }
}

async function toggleStatus(row: ClassificationRow, checked: boolean) {
  markStatusSaving(row.rowKey, true);
  try {
    await (row.kind === 'category'
      ? updateQualityCategoryApi(row.id, { status: checked ? 1 : 0 })
      : updateQualitySubcategoryApi(row.id, { status: checked ? 1 : 0 }));
    row.status = checked ? 1 : 0;
    const source =
      row.kind === 'category'
        ? findCategory(row.id)
        : findCategory(row.parentId ?? '')?.subcategories.find(
            (item) => item.id === row.id,
          );
    if (source) source.status = row.status;
  } catch {
    message.error(t('common.saveFailed'));
  } finally {
    markStatusSaving(row.rowKey, false);
  }
}

async function toggleRecordStatus(
  record: Record<string, unknown>,
  checked: boolean,
) {
  const row = findRow(record);
  if (row) await toggleStatus(row, checked);
}

async function removeRecord(record: Record<string, unknown>) {
  const row = findRow(record);
  if (!row) return;
  try {
    await (row.kind === 'category'
      ? deleteQualityCategoryApi(row.id)
      : deleteQualitySubcategoryApi(row.id));
    await loadClassifications();
    message.success(t('common.deleteSuccess'));
  } catch {
    message.error(t('common.deleteFailed'));
  }
}

function isCategoryRecord(record: Record<string, unknown>) {
  return findRow(record)?.kind === 'category';
}

function getDeleteConfirm(record: Record<string, unknown>) {
  return t(
    isCategoryRecord(record)
      ? 'sys.qualityClassification.confirmDeleteCategory'
      : 'sys.qualityClassification.confirmDeleteSubcategory',
  );
}

onMounted(loadClassifications);
</script>

<template>
  <Page>
    <div class="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 md:p-6">
      <Alert
        v-if="!canEdit"
        :message="t('sys.qualityClassification.noPermission')"
        type="warning"
        show-icon
      />

      <section>
        <Tabs :active-key="activeScope" @change="handleScopeChange">
          <Tabs.TabPane
            key="INSPECTION_ISSUE_DEFECT"
            :tab="t('sys.qualityClassification.inspectionIssueDefect')"
          />
          <Tabs.TabPane
            key="AFTER_SALES_PRODUCT"
            :tab="t('sys.qualityClassification.afterSalesProduct')"
          />
          <Tabs.TabPane
            key="AFTER_SALES_DEFECT"
            :tab="t('sys.qualityClassification.afterSalesDefect')"
          />
        </Tabs>

        <div class="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 class="text-base font-semibold">
              {{ t('sys.qualityClassification.categoryTree') }}
            </h2>
            <p class="text-muted-foreground mt-1 text-sm">
              {{ t('sys.qualityClassification.description') }}
            </p>
          </div>
          <Space>
            <Tooltip :title="t('common.refresh')">
              <Button
                :disabled="loading"
                shape="circle"
                @click="loadClassifications"
              >
                <IconifyIcon class="size-4" icon="lucide:refresh-cw" />
              </Button>
            </Tooltip>
            <Tooltip :title="t('sys.qualityClassification.addCategory')">
              <Button
                :disabled="!canEdit"
                shape="circle"
                type="primary"
                @click="openCreateCategory"
              >
                <IconifyIcon class="size-4" icon="lucide:plus" />
              </Button>
            </Tooltip>
          </Space>
        </div>

        <Table
          v-model:expanded-row-keys="expandedRowKeys"
          :columns="columns"
          :data-source="rows"
          :loading="loading"
          :pagination="false"
          :scroll="{ x: 760 }"
          row-key="rowKey"
          size="middle"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'name'">
              <Space>
                <span class="font-medium">{{ record.name }}</span>
                <Tag :color="record.kind === 'category' ? 'blue' : 'default'">
                  {{
                    record.kind === 'category'
                      ? t('sys.qualityClassification.primaryCategory')
                      : t('sys.qualityClassification.secondaryCategory')
                  }}
                </Tag>
              </Space>
            </template>
            <template v-else-if="column.key === 'code'">
              <span v-if="record.code">{{ record.code }}</span>
              <span v-else class="text-muted-foreground">—</span>
            </template>
            <template v-else-if="column.key === 'status'">
              <Switch
                :checked="record.status === 1"
                :disabled="!canEdit"
                :loading="statusSavingKeys.has(record.rowKey)"
                size="small"
                @change="
                  (checked) => toggleRecordStatus(record, checked as boolean)
                "
              />
            </template>
            <template v-else-if="column.key === 'actions'">
              <Space :size="4">
                <Tooltip
                  v-if="isCategoryRecord(record)"
                  :title="t('sys.qualityClassification.addSubcategory')"
                >
                  <Button
                    :disabled="!canEdit"
                    shape="circle"
                    type="text"
                    @click="openCreateSubcategoryForRecord(record)"
                  >
                    <IconifyIcon class="size-4" icon="lucide:plus" />
                  </Button>
                </Tooltip>
                <Tooltip :title="t('common.edit')">
                  <Button
                    :disabled="!canEdit"
                    shape="circle"
                    type="text"
                    @click="openEditRecord(record)"
                  >
                    <IconifyIcon class="size-4" icon="lucide:pencil" />
                  </Button>
                </Tooltip>
                <Popconfirm
                  :title="getDeleteConfirm(record)"
                  @confirm="removeRecord(record)"
                >
                  <Tooltip :title="t('common.delete')">
                    <Button
                      danger
                      :disabled="!canEdit"
                      shape="circle"
                      type="text"
                    >
                      <IconifyIcon class="size-4" icon="lucide:trash-2" />
                    </Button>
                  </Tooltip>
                </Popconfirm>
              </Space>
            </template>
          </template>
        </Table>
      </section>
    </div>

    <Modal
      v-model:open="modalOpen"
      :confirm-loading="saving"
      :title="modalTitle"
      @ok="saveClassification"
    >
      <Alert
        v-if="editingKind === 'subcategory' && parentCategory"
        :message="
          t('sys.qualityClassification.parentCategory', {
            name: parentCategory.name,
          })
        "
        class="mb-4"
        type="info"
        show-icon
      />
      <Form layout="vertical">
        <Form.Item :label="t('sys.qualityClassification.name')" required>
          <Input v-model:value="draft.name" :maxlength="191" />
        </Form.Item>
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Form.Item :label="t('sys.qualityClassification.code')">
            <Input
              v-model:value="draft.code"
              :disabled="Boolean(editingId)"
              :maxlength="64"
              :placeholder="t('sys.qualityClassification.codePlaceholder')"
            />
          </Form.Item>
          <Form.Item :label="t('sys.qualityClassification.sort')">
            <InputNumber
              v-model:value="draft.sort"
              :max="9999"
              :min="0"
              class="w-full"
            />
          </Form.Item>
        </div>
        <Form.Item :label="t('sys.qualityClassification.enabled')">
          <Switch
            :checked="draft.status === 1"
            @change="(checked) => (draft.status = checked ? 1 : 0)"
          />
        </Form.Item>
      </Form>
    </Modal>
  </Page>
</template>
