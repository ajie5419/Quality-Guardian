import type { ComputedRef, Ref } from 'vue';

import type { VxeGridProps } from '#/adapter/vxe-table';
import type { QmsAfterSalesApi } from '#/api/qms/after-sales';
import type { BaseTreeNode } from '#/types/tree';

import { computed } from 'vue';

import { findNameById } from '#/types';
import { createVxePhotoXlsxExportMethod } from '#/utils/vxe-photo-export';
import {
  extractPhotoThumbUrl,
  extractPhotoUrl,
  isNonEmptyString,
} from '#/views/qms/shared/utils/photo-url';

import { useStatusOptions } from '../constants';

type GridFormSchema = NonNullable<
  NonNullable<VxeGridProps['formOptions']>['schema']
>[number];

type ExtendedGridFormSchema = GridFormSchema & { colProps?: { span?: number } };

type AfterSalesGridRow = QmsAfterSalesApi.AfterSalesItem & {
  photoExportUrl: string;
  photos: string[];
  photoThumbUrl: string;
};

interface UseAfterSalesGridParams {
  canDelete: Ref<boolean>;
  canEdit: Ref<boolean>;
  canImport: Ref<boolean>;
  canSettle: ComputedRef<boolean>;
  canToolbarExport: ComputedRef<boolean>;
  currentYear: Ref<number>;
  deptRawData: Ref<BaseTreeNode[]>;
  getAfterSalesListPage: (
    params?: QmsAfterSalesApi.AfterSalesParams,
  ) => Promise<{ items: QmsAfterSalesApi.AfterSalesItem[]; total: number }>;
  handleDelete: (row: QmsAfterSalesApi.AfterSalesItem) => void;
  handleEdit: (row: QmsAfterSalesApi.AfterSalesItem) => void;
  handleImport: (params: { file: File }) => Promise<void>;
  handleSettleToKnowledge: (row: QmsAfterSalesApi.AfterSalesItem) => void;
  t: (key: string, params?: Record<string, any>) => string;
}

function normalizeAfterSalesRows(
  data: QmsAfterSalesApi.AfterSalesItem[],
): AfterSalesGridRow[] {
  return (data || []).map((item) => {
    let photos = item.photos;
    if (typeof photos === 'string') {
      try {
        photos = JSON.parse(photos);
      } catch {
        photos = [];
      }
    }
    const photoList = Array.isArray(photos)
      ? photos
          .map((photo) => extractPhotoUrl(photo))
          .filter((value): value is string => isNonEmptyString(value))
      : [];
    const thumbList = Array.isArray(photos)
      ? photos
          .map((photo) => extractPhotoThumbUrl(photo))
          .filter((value): value is string => isNonEmptyString(value))
      : [];

    return {
      ...item,
      photos: photoList,
      photoExportUrl: photoList[0] || '',
      photoThumbUrl: thumbList[0] || photoList[0] || '',
    };
  });
}

export function useAfterSalesGrid({
  canDelete,
  canEdit,
  canImport,
  canSettle,
  canToolbarExport,
  currentYear,
  deptRawData,
  getAfterSalesListPage,
  handleDelete,
  handleEdit,
  handleImport,
  handleSettleToKnowledge,
  t,
}: UseAfterSalesGridParams) {
  const { statusOptions } = useStatusOptions();
  const statusOptionsList = computed(() =>
    statusOptions.value.map((opt) => ({
      label: opt.label,
      value: opt.value,
    })),
  );

  const exportAfterSalesAsXlsx =
    createVxePhotoXlsxExportMethod<AfterSalesGridRow>({
      sheetName: t('qms.afterSales.title'),
      filename: () => `${t('qms.afterSales.title')}-${Date.now()}.xlsx`,
      getPhotoUrl: (row) => row.photoExportUrl || '',
      getRows: async ({ mode, $table, $grid }) => {
        if (mode === 'selected') {
          return normalizeAfterSalesRows($table.getCheckboxRecords() || []);
        }
        if (mode === 'all') {
          const proxyInfo = $grid?.getProxyInfo?.();
          const data = await getAfterSalesListPage({
            year: currentYear.value,
            ...proxyInfo?.form,
          } as QmsAfterSalesApi.AfterSalesParams);
          return normalizeAfterSalesRows(data.items || []);
        }
        const tableData = $table.getTableData?.();
        return normalizeAfterSalesRows(tableData?.fullData || []);
      },
    });

  const gridOptions = computed(() => ({
    checkboxConfig: {
      reserve: true,
      highlight: true,
    },
    toolbarConfig: {
      export: canToolbarExport.value,
      import: canImport.value,
      refresh: true,
      search: true,
      zoom: true,
      custom: true,
      slots: { buttons: 'toolbar-actions' },
    },
    importConfig: {
      remote: true,
      importMethod: ({ file }: { file: File }) => handleImport({ file }),
    },
    exportConfig: {
      remote: true,
      exportMethod: exportAfterSalesAsXlsx,
      types: ['xlsx'],
      modes: ['current', 'selected', 'all'],
    },
    columns: [
      { type: 'checkbox', width: 50, fixed: 'left' },
      {
        type: 'seq',
        title: t('qms.afterSales.columns.seq'),
        width: 60,
        fixed: 'left',
      },
      {
        field: 'workOrderNumber',
        title: t('qms.afterSales.form.workOrderNumber'),
        minWidth: 120,
        fixed: 'left',
      },
      {
        field: 'division',
        title: t('qms.afterSales.form.division'),
        width: 120,
        formatter: ({ cellValue }: { cellValue: string }) => {
          if (!cellValue) return '';
          const name = findNameById(deptRawData.value, cellValue);
          return name || cellValue;
        },
      },
      {
        field: 'isClaim',
        title: t('qms.afterSales.columns.isClaim'),
        width: 100,
        slots: { default: 'isClaim' },
      },
      {
        field: 'projectName',
        title: t('qms.afterSales.form.projectName'),
        minWidth: 150,
      },
      {
        field: 'partName',
        title: t('qms.afterSales.form.partName'),
        minWidth: 150,
      },
      {
        field: 'customerName',
        title: t('qms.afterSales.form.customerName'),
        minWidth: 150,
      },
      {
        field: 'location',
        title: t('qms.afterSales.form.location'),
        minWidth: 120,
      },
      {
        field: 'factoryDate',
        title: t('qms.afterSales.form.factoryDate'),
        width: 120,
      },
      {
        field: 'warrantyStatus',
        title: t('qms.afterSales.form.warrantyStatus'),
        width: 100,
      },
      {
        field: 'issueDescription',
        title: t('qms.afterSales.form.issueDescription'),
        minWidth: 200,
      },
      {
        field: 'photos',
        title: t('qms.afterSales.form.photos'),
        width: 80,
        slots: { default: 'photos' },
      },
      {
        field: 'productType',
        title: t('qms.afterSales.form.productType'),
        minWidth: 120,
      },
      {
        field: 'productSubtype',
        title: t('qms.afterSales.form.productSubtype'),
        minWidth: 120,
      },
      {
        field: 'runningHours',
        title: t('qms.afterSales.form.runningHours'),
        width: 100,
      },
      {
        field: 'defectType',
        title: t('qms.afterSales.form.defectType'),
        minWidth: 120,
      },
      {
        field: 'defectSubtype',
        title: t('qms.afterSales.form.defectSubtype'),
        minWidth: 120,
      },
      {
        field: 'severity',
        title: t('qms.afterSales.form.severity'),
        width: 100,
      },
      {
        field: 'quantity',
        title: t('qms.afterSales.form.quantity'),
        width: 80,
      },
      {
        field: 'issueDate',
        title: t('qms.afterSales.form.issueDate'),
        width: 120,
      },
      {
        field: 'handler',
        title: t('qms.afterSales.form.handler'),
        width: 100,
      },
      {
        field: 'resolutionPlan',
        title: t('qms.afterSales.form.resolutionPlan'),
        minWidth: 200,
      },
      {
        field: 'responsibleDept',
        title: t('qms.afterSales.form.responsibleDept'),
        width: 120,
        formatter: ({ cellValue }: { cellValue: string }) => {
          if (!cellValue) return '';
          const name = findNameById(deptRawData.value, cellValue);
          return name || cellValue;
        },
      },
      {
        field: 'supplierBrand',
        title: t('qms.afterSales.form.supplierBrand'),
        width: 150,
      },
      {
        field: 'materialCost',
        title: t('qms.afterSales.form.materialCost'),
        width: 100,
      },
      {
        field: 'laborTravelCost',
        title: t('qms.afterSales.form.laborTravelCost'),
        width: 120,
      },
      {
        field: 'closeDate',
        title: t('qms.afterSales.form.closeDate'),
        width: 120,
      },
      {
        field: 'status',
        title: t('qms.afterSales.form.status'),
        width: 100,
        fixed: 'right',
        slots: { default: 'status' },
      },
      {
        title: t('qms.afterSales.columns.action'),
        width: 150,
        fixed: 'right',
        cellRender: {
          name: 'CellOperation',
          props: {
            options: [
              ...(canEdit.value ? ['edit'] : []),
              ...(canSettle.value
                ? [
                    {
                      code: 'settle',
                      icon: 'lucide:book-check',
                      title: t('qms.inspection.issues.settleToKnowledge'),
                    },
                  ]
                : []),
              ...(canDelete.value ? ['delete'] : []),
            ],
            onClick: ({
              code,
              row,
            }: {
              code: string;
              row: QmsAfterSalesApi.AfterSalesItem;
            }) => {
              if (code === 'edit') handleEdit(row);
              if (code === 'delete') handleDelete(row);
              if (code === 'settle') handleSettleToKnowledge(row);
            },
          },
        },
      },
    ],
    proxyConfig: {
      ajax: {
        query: async (
          { page }: { page?: { currentPage?: number; pageSize?: number } },
          formValues: Record<string, unknown> = {},
        ) => {
          const data = await getAfterSalesListPage({
            year: currentYear.value,
            ...formValues,
          } as QmsAfterSalesApi.AfterSalesParams);
          const items = normalizeAfterSalesRows(data.items || []);

          const { currentPage = 1, pageSize = 20 } = page || {};
          const start = (currentPage - 1) * pageSize;
          const end = start + pageSize;
          const pageData = items.slice(start, end);

          return { items: pageData, total: items.length };
        },
        queryAll: async ({
          form,
          formValues,
        }: {
          form?: Record<string, unknown>;
          formValues?: Record<string, unknown>;
        }) => {
          const filters = form || formValues || {};
          const data = await getAfterSalesListPage({
            year: currentYear.value,
            ...filters,
          } as QmsAfterSalesApi.AfterSalesParams);
          return { items: normalizeAfterSalesRows(data.items || []) };
        },
      },
    },
  }));

  const formSchema: ExtendedGridFormSchema[] = [
    {
      fieldName: 'workOrderNumber',
      label: t('qms.afterSales.form.workOrderNumber'),
      component: 'Input',
      colProps: { span: 6 },
    },
    {
      fieldName: 'customerName',
      label: t('qms.afterSales.form.customerName'),
      component: 'Input',
      colProps: { span: 6 },
    },
    {
      fieldName: 'status',
      label: t('qms.afterSales.form.status'),
      component: 'Select',
      componentProps: {
        options: statusOptionsList,
      },
      colProps: { span: 6 },
    },
  ];

  return {
    formSchema,
    gridOptions,
  };
}
