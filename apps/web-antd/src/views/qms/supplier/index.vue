<script lang="ts" setup>
import type { VxeGridListeners, VxeGridProps } from '#/adapter/vxe-table';
import type { QmsSupplierApi } from '#/api/qms/supplier';
import type { VxeCheckboxChangeParams } from '#/types';

import { reactive, ref } from 'vue';

import { useAccess } from '@vben/access';
import { Page } from '@vben/common-ui';
import { useI18n } from '@vben/locales';

import {
  Badge,
  Button,
  Card,
  message,
  Modal,
  Space,
  Tag,
  Tooltip,
} from 'ant-design-vue';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import {
  batchDeleteSuppliers,
  deleteSupplier,
  getSupplierList,
} from '#/api/qms/supplier';

import { RATING_COLORS, SUPPLIER_STATUS_UI_MAP } from '../common-constants';
import SupplierDetailDrawer from './components/SupplierDetailDrawer.vue';
import SupplierEditModal from './components/SupplierEditModal.vue';
import SupplierStats from './components/SupplierStats.vue';
import { getColumns, getSearchFormSchema } from './data';

const { t } = useI18n();

// 权限控制
const { hasAccessByCodes } = useAccess();

const checkedRows = ref<QmsSupplierApi.SupplierItem[]>([]);
const editModalRef = ref();
const detailDrawerRef = ref();

// 统计数据
const stats = ref<QmsSupplierApi.SupplierStats>({
  avgScore: '0.0',
  qualified: 0,
  total: 0,
  warning: 0,
});

function onCheckChange(
  params: VxeCheckboxChangeParams<QmsSupplierApi.SupplierItem>,
) {
  const records = params.$grid.getCheckboxRecords() || [];
  checkedRows.value = records;
}

// ================= 表格 Grid 配置 =================
const gridOptions = reactive<VxeGridProps<QmsSupplierApi.SupplierItem>>({
  rowConfig: {
    keyField: 'id',
    isHover: true,
  },
  height: 600,
  sortConfig: {
    remote: true,
    trigger: 'cell',
  },
  pagerConfig: {
    pageSize: 20,
    pageSizes: [10, 20, 30, 50, 100],
  },
  toolbarConfig: {
    slots: { buttons: 'toolbar-actions' },
    custom: true,
    export: true,
    import: true,
    zoom: true,
    refresh: true,
  },
  exportConfig: {
    remote: false,
    types: ['xlsx', 'csv'],
    modes: ['current', 'selected', 'all'],
  },
  keepSource: true,
  checkboxConfig: {
    reserve: true,
    highlight: true,
    range: true,
  },
  columns: getColumns('Supplier'),
  proxyConfig: {
    autoLoad: true,
    sort: true,
    ajax: {
      query: async ({ page, sorts }, formValues) => {
        try {
          const params: QmsSupplierApi.SupplierListParams = {
            category: 'Supplier',
            page: page?.currentPage,
            pageSize: page?.pageSize,
            sortBy: sorts?.[0]?.field,
            sortOrder: sorts?.[0]?.order as 'asc' | 'desc',
            ...formValues,
          };

          const response = await getSupplierList(params);
          if (response.stats) {
            stats.value = response.stats;
          }
          return { items: response.items || [], total: response.total || 0 };
        } catch (error) {
          console.error('Failed to load suppliers:', error);
          return { items: [], total: 0 };
        }
      },
      queryAll: async ({ formValues }) => {
        try {
          const params: QmsSupplierApi.SupplierListParams = {
            category: 'Supplier',
            page: 1,
            pageSize: 100000,
            ...formValues,
          };
          const response = await getSupplierList(params);
          return { items: response.items || [] };
        } catch (error) {
          console.error('Failed to load all suppliers:', error);
          return { items: [] };
        }
      },
    },
  },
});

const gridEvents: VxeGridListeners<QmsSupplierApi.SupplierItem> = {
  checkboxChange: onCheckChange,
  checkboxAll: onCheckChange,
};

const [Grid, gridApi] = useVbenVxeGrid({
  gridOptions,
  gridEvents,
  formOptions: {
    schema: getSearchFormSchema('Supplier'),
    submitOnChange: true,
  },
});

// ================= 操作逻辑 =================

function handleOpenModal() {
  editModalRef.value?.open({ isUpdate: false, category: 'Supplier' });
}

function handleEdit(row: QmsSupplierApi.SupplierItem) {
  editModalRef.value?.open({ isUpdate: true, record: row, category: 'Supplier' });
}

function handleDelete(row: QmsSupplierApi.SupplierItem) {
  Modal.confirm({
    title: t('common.confirmDelete'),
    content: `${t('common.confirmDeleteContent')} [${row.name}] ?`,
    onOk: async () => {
      try {
        await deleteSupplier(row.id);
        message.success(t('common.deleteSuccess'));
        gridApi.reload();
      } catch (error) {
        console.error('Delete failed:', error);
      }
    },
  });
}

function handleBatchDelete() {
  if (checkedRows.value.length === 0) return;
  Modal.confirm({
    title: t('common.confirmDelete'),
    content: t('common.confirmBatchDelete', { count: checkedRows.value.length }),
    onOk: async () => {
      try {
        const ids = checkedRows.value.map((row) => row.id);
        await batchDeleteSuppliers(ids);
        message.success(t('common.deleteSuccess'));
        checkedRows.value = [];
        gridApi.reload();
      } catch (error) {
        console.error('Batch delete failed:', error);
      }
    },
  });
}

function showDetail(row: QmsSupplierApi.SupplierItem) {
  detailDrawerRef.value?.open(row, t('qms.supplier.title'));
}

function handleSuccess() {
  gridApi.reload();
}
</script>

<template>
  <Page>
    <div class="flex flex-col gap-4 p-4">
      <!-- 统计卡片 -->
      <SupplierStats :stats="stats" type="Supplier" />

      <!-- 表格 -->
      <Card
        :title="t('qms.supplier.performanceList')"
        :bordered="false"
        class="shadow-sm"
      >
        <Grid>
          <template #toolbar-actions>
            <Space>
              <Button
                v-access:code="'QMS:Supplier:Create'"
                shape="round"
                type="primary"
                @click="handleOpenModal"
              >
                <span class="vxe-icon-add mr-1"></span>
                {{ t('qms.supplier.addSupplier') }}
              </Button>
              <Button
                v-if="checkedRows.length > 0"
                v-access:code="'QMS:Supplier:Delete'"
                danger
                shape="round"
                type="primary"
                @click="handleBatchDelete"
              >
                <span class="vxe-icon-delete mr-1"></span>
                {{ t('common.batchDelete') }}
              </Button>
            </Space>
          </template>

          <template #name_link="{ row }">
            <div class="flex items-center gap-2">
              <a class="font-bold text-blue-600" @click="showDetail(row)">{{
                row.name
              }}</a>
              <Tooltip
                v-if="row.isWarning"
                :title="
                  row.warningReasons?.join('、') ||
                  t('qms.supplier.warningPrompt')
                "
              >
                <span
                  class="i-lucide-alert-triangle animate-pulse cursor-help text-red-500"
                ></span>
              </Tooltip>
            </div>
          </template>

          <template #status_badge="{ row }">
            <Badge
              :status="SUPPLIER_STATUS_UI_MAP[row.status]?.status || 'default'"
              :text="
                t(
                  SUPPLIER_STATUS_UI_MAP[row.status]?.textKey,
                  SUPPLIER_STATUS_UI_MAP[row.status]?.defaultText,
                )
              "
            />
          </template>

          <template #level_tag="{ row }">
            <Tag :color="RATING_COLORS[row.level || row.rating] || 'default'">
              {{ row.level || row.rating || '-' }} {{ t('common.level') }}
            </Tag>
          </template>

          <template #score_tag="{ row }">
            <span
              :class="{
                'text-green-600': (row.qualityScore ?? 0) >= 90,
                'text-blue-600':
                  (row.qualityScore ?? 0) >= 80 && (row.qualityScore ?? 0) < 90,
                'text-red-600': (row.qualityScore ?? 0) < 80,
              }"
              class="font-mono font-bold"
            >
              {{ row.qualityScore ?? '-' }}
            </span>
          </template>

          <template #eng_issue="{ row }">
            <span
              :class="{
                'font-bold text-orange-500': (row.engineeringIssueCount ?? 0) > 0,
                'text-gray-400': (row.engineeringIssueCount ?? 0) <= 0,
              }"
            >
              {{ row.engineeringIssueCount ?? 0 }} {{ t('common.unit.item') }}
            </span>
          </template>

          <template #issue_count="{ row }">
            <span
              :class="{
                'font-bold text-red-500': (row.afterSalesIssueCount ?? 0) > 0,
                'text-gray-400': (row.afterSalesIssueCount ?? 0) <= 0,
              }"
            >
              {{ row.afterSalesIssueCount ?? 0 }} {{ t('common.unit.item') }}
            </span>
          </template>

          <template #action="{ row }">
            <Space>
              <Button
                v-access:code="'QMS:Supplier:Edit'"
                :key="`edit-${row.id}`"
                size="small"
                type="link"
                @click="handleEdit(row)"
              >
                {{ t('common.edit') }}
              </Button>
              <Button
                v-access:code="'QMS:Supplier:Delete'"
                :key="`del-${row.id}`"
                danger
                size="small"
                type="link"
                @click="handleDelete(row)"
              >
                {{ t('common.delete') }}
              </Button>
            </Space>
          </template>
        </Grid>
      </Card>
    </div>

    <SupplierEditModal ref="editModalRef" @success="handleSuccess" />
    <SupplierDetailDrawer ref="detailDrawerRef" />
  </Page>
</template>

<style scoped>
:deep(.ant-card-head) {
  border-bottom: 1px solid #f0f0f0;
}
</style>
