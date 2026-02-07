<script lang="ts" setup>
import type { VxeGridProps } from '#/adapter/vxe-table';
import type { VxeCheckboxChangeParams } from '#/types';

import { computed, ref } from 'vue';

import { Page } from '@vben/common-ui';
import { useI18n } from '@vben/locales';

import { Button, message, Modal, Space, Tag } from 'ant-design-vue';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import {
  batchDeleteAuditLogs,
  deleteAuditLog,
  getAuditLogList,
} from '#/api/system/audit-log';

const { t } = useI18n();

const checkedRows = ref<any[]>([]);

function onCheckChange(params: VxeCheckboxChangeParams) {
  const records = params.$grid.getCheckboxRecords() || [];
  checkedRows.value = records;
}

const gridEvents = {
  checkboxChange: onCheckChange,
  checkboxAll: onCheckChange,
};

const gridOptions = computed<VxeGridProps>(() => ({
  checkboxConfig: {
    reserve: true,
    highlight: true,
    range: true,
  },
  toolbarConfig: {
    slots: { buttons: 'toolbar-actions' },
    search: true,
    zoom: true,
    refresh: true,
    custom: true,
  },
  columns: [
    { type: 'checkbox', width: 50, fixed: 'left' },
    { type: 'seq', title: t('common.seq'), width: 60, fixed: 'left' },
    { field: 'username', title: '操作人', width: 120 },
    {
      field: 'action',
      title: '操作类型',
      width: 100,
      slots: { default: 'action' },
    },
    {
      field: 'targetType',
      title: '操作场景',
      width: 140,
    },
    {
      field: 'targetId',
      title: '目标ID',
      width: 180,
    },
    {
      field: 'details',
      title: '详情',
      minWidth: 200,
    },
    {
      field: 'ipAddress',
      title: '操作IP',
      width: 140,
      formatter: ({ cellValue }) => {
        if (!cellValue) return '';
        return cellValue === '::1'
          ? '127.0.0.1'
          : cellValue.replace(/^::ffff:/, '');
      },
    },
    {
      field: 'createdAt',
      title: '操作时间',
      width: 180,
      formatter: ({ cellValue }) => {
        if (!cellValue) return '';
        const date = new Date(cellValue);
        return date.toLocaleString();
      },
    },
    {
      title: t('common.action'),
      width: 80,
      fixed: 'right',
      cellRender: {
        name: 'CellOperation',
        props: {
          options: [
            {
              code: 'delete',
              icon: 'ant-design:delete-outlined',
              label: t('common.delete'),
              danger: true,
            },
          ],
          onClick: ({ code, row }: { code: string; row: any }) => {
            if (code === 'delete') handleDelete(row);
          },
        },
      },
    },
  ],
  proxyConfig: {
    ajax: {
      query: async ({ page, form }) => {
        const params = {
          page: page?.currentPage,
          pageSize: page?.pageSize,
          ...form,
        };
        const result = await getAuditLogList(params);
        return result;
      },
    },
  },
}));

const [Grid, gridApi] = useVbenVxeGrid({
  gridOptions: gridOptions as any,
  gridEvents,
  formOptions: {
    schema: [
      {
        component: 'Input',
        defaultValue: '',
        fieldName: 'targetType',
        label: '业务模块',
      },
      {
        component: 'Select',
        defaultValue: '',
        fieldName: 'action',
        label: '操作类型',
        componentProps: {
          options: [
            { label: 'DELETE', value: 'DELETE' },
            { label: 'UPDATE', value: 'UPDATE' },
            { label: 'CREATE', value: 'CREATE' },
          ],
        },
      },
      {
        component: 'RangePicker',
        fieldName: 'dateRange',
        label: '操作日期',
        componentProps: {
          style: { width: '100%' },
          valueFormat: 'YYYY-MM-DD',
        },
      },
    ],
    // 处理日期范围
    submitButtonOptions: {
      onClick: ({ formModel }: any) => {
        if (formModel.dateRange && formModel.dateRange.length === 2) {
          formModel.startDate = formModel.dateRange[0];
          formModel.endDate = formModel.dateRange[1];
        } else {
          formModel.startDate = undefined;
          formModel.endDate = undefined;
        }
      },
    },
  },
});

async function handleDelete(row: any) {
  Modal.confirm({
    title: t('common.confirmDelete'),
    content: '确定要删除这条审计日志吗？',
    onOk: async () => {
      try {
        await deleteAuditLog(row.id);
        message.success(t('common.deleteSuccess'));
        gridApi.reload();
      } catch (error: any) {
        message.error(error.message || t('common.deleteFailed'));
      }
    },
  });
}

async function handleBatchDelete() {
  if (checkedRows.value.length === 0) {
    message.warning('请先选择要删除的记录');
    return;
  }

  Modal.confirm({
    title: '批量删除确认',
    content: `确定要删除选中的 ${checkedRows.value.length} 条记录吗？`,
    onOk: async () => {
      try {
        await batchDeleteAuditLogs(checkedRows.value.map((r) => r.id));
        message.success('批量删除成功');
        checkedRows.value = [];
        gridApi.reload();
      } catch (error: any) {
        message.error(error.message || '批量删除失败');
      }
    },
  });
}
</script>

<template>
  <Page auto-content-height>
    <Grid>
      <template #toolbar-actions>
        <Space>
          <Button type="primary" danger @click="handleBatchDelete">
            批量删除
          </Button>
        </Space>
      </template>

      <template #action="{ row }">
        <Tag :color="row.action === 'DELETE' ? 'red' : 'blue'">
          {{ row.action }}
        </Tag>
      </template>
    </Grid>
  </Page>
</template>
