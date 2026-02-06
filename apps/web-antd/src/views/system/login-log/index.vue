<script lang="ts" setup>
import type { VxeGridProps } from '#/adapter/vxe-table';
import type { VxeCheckboxChangeParams } from '#/types';

import { computed, ref } from 'vue';

import { Page } from '@vben/common-ui';
import { useI18n } from '@vben/locales';

import { Button, message, Modal, Space, Tag } from 'ant-design-vue';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import {
  batchDeleteLoginLogs,
  deleteLoginLog,
  getLoginLogList,
} from '#/api/system/login-log';

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
    { field: 'username', title: '用户名', width: 120 },
    {
      field: 'status',
      title: '登录状态',
      width: 100,
      slots: { default: 'status' },
    },
    {
      field: 'method',
      title: '登录方式',
      width: 120,
      slots: { default: 'method' },
    },
    {
      field: 'ip',
      title: '登录IP',
      width: 140,
      formatter: ({ cellValue }) => {
        if (!cellValue) return '';
        return cellValue === '::1'
          ? '127.0.0.1'
          : cellValue.replace(/^::ffff:/, '');
      },
    },
    { field: 'browser', title: '浏览器', width: 120 },
    { field: 'os', title: '操作系统', width: 120 },
    { field: 'device', title: '设备类型', width: 120 },
    {
      field: 'createdAt',
      title: '登录时间',
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
        const result = await getLoginLogList(params);
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
        fieldName: 'username',
        label: '用户名',
      },
      {
        component: 'Select',
        defaultValue: '',
        fieldName: 'status',
        label: '状态',
        componentProps: {
          options: [
            { label: '成功', value: '成功' },
            { label: '失败', value: '失败' },
          ],
        },
      },
      {
        component: 'RangePicker',
        fieldName: 'dateRange',
        label: '登录日期',
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
    content: '确定要删除这条登录日志吗？',
    onOk: async () => {
      try {
        await deleteLoginLog(row.id);
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
        await batchDeleteLoginLogs(checkedRows.value.map((r) => r.id));
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

      <template #status="{ row }">
        <Tag :color="row.status === '成功' ? 'green' : 'red'">
          {{ row.status }}
        </Tag>
      </template>

      <template #method="{ row }">
        <Tag color="blue">{{ row.method }}</Tag>
      </template>
    </Grid>
  </Page>
</template>
