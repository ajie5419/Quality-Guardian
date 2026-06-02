import type { Ref } from 'vue';

import type { WorkOrderSearchFormValues } from './useWorkOrderQueryFilters';

import type { VxeGridProps } from '#/adapter/vxe-table';
import type {
  QmsWorkOrderApi,
  WorkOrderDashboardStats,
} from '#/api/qms/work-order';
import type { SystemDeptApi } from '#/api/system/dept';

import { computed } from 'vue';

import { WorkOrderStatusEnum } from '@qgs/shared';
import { message } from 'ant-design-vue';

import {
  getWorkOrderDashboardStats,
  getWorkOrderExportList,
  getWorkOrderListPage,
} from '#/api/qms/work-order';
import { findNameById } from '#/types';
import { createVxePhotoXlsxExportMethod } from '#/utils/vxe-photo-export';

import { getGridColumns } from '../data';
import { getStatusInfo } from './useWorkOrderStatus';

export function useWorkOrderGridOptions(options: {
  buildQueryParams: (
    formValues?: WorkOrderSearchFormValues,
  ) => Record<string, unknown>;
  canDelete: Ref<boolean>;
  canEdit: Ref<boolean>;
  canExport: Ref<boolean>;
  canImport: Ref<boolean>;
  deptRawData: Ref<SystemDeptApi.Dept[]>;
  handleApiError: (error: unknown, context: string) => void;
  handleDelete: (row: QmsWorkOrderApi.WorkOrderItem) => void;
  handleEdit: (row: QmsWorkOrderApi.WorkOrderItem) => void;
  handleImport: (params: { file: File }) => Promise<void>;
  isStatsLoading: Ref<boolean>;
  latestRequirementQueryParams: Ref<Record<string, unknown>>;
  loadOverview: (params: Record<string, unknown>) => Promise<unknown>;
  syncMobileRows: (payload: {
    items: QmsWorkOrderApi.WorkOrderItem[];
    total: number;
  }) => void;
  t: (key: string, params?: Record<string, unknown>) => string;
  workOrderStats: Ref<null | WorkOrderDashboardStats>;
}) {
  const statusOptions = computed(() =>
    Object.values(WorkOrderStatusEnum).map((value) => {
      const info = getStatusInfo(value);
      return { label: info.defaultText, value };
    }),
  );

  const formSchema = [
    {
      fieldName: 'workOrderNumber',
      label: options.t('qms.workOrder.workOrderNumber'),
      component: 'Input',
      componentProps: {
        placeholder: options.t('common.pleaseInput'),
        allowClear: true,
      },
      colProps: { span: 6 },
    },
    {
      fieldName: 'productName',
      label: options.t('qms.workOrder.productName'),
      component: 'Input',
      componentProps: {
        placeholder: options.t('common.pleaseInput'),
        allowClear: true,
      },
      colProps: { span: 6 },
    },
    {
      fieldName: 'status',
      label: options.t('qms.workOrder.statusLabel'),
      component: 'Select',
      componentProps: {
        options: statusOptions,
        placeholder: options.t('common.pleaseSelect'),
        allowClear: true,
      },
      colProps: { span: 6 },
    },
  ];

  const exportWorkOrderAsXlsx =
    createVxePhotoXlsxExportMethod<QmsWorkOrderApi.WorkOrderItem>({
      sheetName: options.t('qms.workOrder.title'),
      filename: () => `${options.t('qms.workOrder.title')}-${Date.now()}.xlsx`,
      photoField: '__none__',
      getPhotoUrl: () => '',
      getRows: async ({ mode, $table, $grid }) => {
        if (mode === 'selected') {
          return $table.getCheckboxRecords() || [];
        }
        if (mode === 'all') {
          const proxyInfo = $grid?.getProxyInfo?.();
          const formValues = (proxyInfo?.form ||
            {}) as WorkOrderSearchFormValues;
          const response = await getWorkOrderExportList(
            options.buildQueryParams(formValues),
          );
          return response.items || [];
        }
        const tableData = $table.getTableData?.();
        return tableData?.fullData || [];
      },
    });

  const gridOptions = computed<VxeGridProps>(() => ({
    columns: [
      { type: 'checkbox', width: 50 },
      ...(getGridColumns() || []).map((col) => {
        if (col.field === 'division') {
          return {
            ...col,
            slots: {},
            formatter: ({
              cellValue,
            }: {
              cellValue: null | string | undefined;
            }) => {
              return (
                findNameById(options.deptRawData.value, cellValue || '') ||
                cellValue ||
                '-'
              );
            },
          };
        }
        if (col.slots?.default === 'action') {
          return {
            ...col,
            slots: undefined,
            cellRender: {
              name: 'CellOperation',
              props: {
                options: [
                  ...(options.canEdit.value ? ['edit'] : []),
                  ...(options.canDelete.value ? ['delete'] : []),
                ],
                onClick: ({
                  code,
                  row,
                }: {
                  code: string;
                  row: QmsWorkOrderApi.WorkOrderItem;
                }) => {
                  if (code === 'edit') options.handleEdit(row);
                  if (code === 'delete') options.handleDelete(row);
                },
              },
            },
          };
        }
        return col;
      }),
    ],
    checkboxConfig: {
      reserve: true,
      highlight: true,
    },
    toolbarConfig: {
      export: options.canExport.value,
      refresh: true,
      import: options.canImport.value,
      search: true,
      zoom: true,
      custom: true,
      slots: {
        buttons: 'toolbar-actions',
      },
    },
    importConfig: {
      remote: true,
      importMethod: options.handleImport,
    },
    exportConfig: {
      remote: true,
      exportMethod: exportWorkOrderAsXlsx,
      types: ['xlsx'],
      modes: ['current', 'selected', 'all'],
    },
    proxyConfig: {
      ajax: {
        query: async (
          {
            page: pageParams,
          }: { page?: { currentPage?: number; pageSize?: number } },
          formValues: WorkOrderSearchFormValues,
        ) => {
          try {
            const { currentPage = 1, pageSize = 20 } = pageParams || {};
            options.isStatsLoading.value = true;
            const queryParams = options.buildQueryParams(formValues);

            options.latestRequirementQueryParams.value = queryParams;
            const [response, stats] = await Promise.all([
              getWorkOrderListPage({
                page: currentPage,
                pageSize,
                ...queryParams,
              }),
              getWorkOrderDashboardStats(queryParams),
              options.loadOverview(queryParams),
            ]);
            options.workOrderStats.value = stats;

            const { items, total } = response;
            options.syncMobileRows({ items, total });
            return { items, total };
          } catch (error: unknown) {
            options.handleApiError(error, 'Load Work Order List');
            message.error(
              options.t('qms.common.dataLoadFailed') +
                ((error as { message?: string }).message
                  ? `: ${(error as { message?: string }).message}`
                  : ''),
            );
            return { items: [], total: 0 };
          } finally {
            options.isStatsLoading.value = false;
          }
        },
        queryAll: async (params) => {
          const rawParams = params as {
            form?: Record<string, unknown>;
            formValues?: Record<string, unknown>;
          };
          const formValues =
            (rawParams.form as unknown as WorkOrderSearchFormValues) ||
            (rawParams.formValues as unknown as WorkOrderSearchFormValues);
          try {
            const response = await getWorkOrderListPage({
              page: 1,
              pageSize: 100_000,
              ...options.buildQueryParams(formValues),
            });
            return { items: response.items };
          } catch (error) {
            options.handleApiError(error, 'Query All Work Orders');
            message.error(options.t('qms.common.dataLoadFailed'));
            return { items: [] };
          }
        },
      },
    },
  }));

  return { formSchema, gridOptions };
}
