import type { ComputedRef, Ref } from 'vue';

import type { InspectionIssue } from '../types';

import type { VxeGridProps } from '#/adapter/vxe-table';
import type { BaseTreeNode } from '#/types/tree';

import { computed } from 'vue';

import dayjs from 'dayjs';

import { getInspectionIssues } from '#/api/qms/inspection';
import { findNameById } from '#/types';
import { createVxePhotoXlsxExportMethod } from '#/utils/vxe-photo-export';

import { gridColumns } from '../data';

interface GridFilterItem {
  field: string;
  values?: unknown[];
}

type InspectionGridRow = InspectionIssue & {
  photoExportUrl: string;
  photos: string[];
};

interface UseIssueGridOptionsParams {
  canDelete: Ref<boolean>;
  canEdit: Ref<boolean>;
  canImport: Ref<boolean>;
  canSettle: ComputedRef<boolean>;
  currentYear: Ref<number>;
  deptRawData: Ref<BaseTreeNode[]>;
  handleDelete: (row: InspectionIssue) => void;
  handleEdit: (row: InspectionIssue) => void;
  handleImport: (params: { file: File }) => Promise<void>;
  handleSettleToKnowledge: (row: InspectionIssue) => void;
  t: (key: string, params?: Record<string, any>) => string;
}

function extractPhotoUrl(photo: unknown): string | undefined {
  if (typeof photo === 'string') {
    return photo.trim() || undefined;
  }
  if (photo && typeof photo === 'object') {
    const url = (photo as { url?: unknown }).url;
    if (typeof url === 'string') {
      return url.trim() || undefined;
    }
  }
  return undefined;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function normalizeInspectionRows(data: InspectionIssue[]): InspectionGridRow[] {
  return (data || []).map((item) => {
    const photoList = Array.isArray(item.photos)
      ? item.photos
          .map((photo) => extractPhotoUrl(photo))
          .filter((value): value is string => isNonEmptyString(value))
      : [];
    return {
      ...item,
      photos: photoList,
      photoExportUrl: photoList[0] || '',
    };
  });
}

export function useIssueGridOptions({
  canDelete,
  canEdit,
  canImport,
  canSettle,
  currentYear,
  deptRawData,
  handleDelete,
  handleEdit,
  handleImport,
  handleSettleToKnowledge,
  t,
}: UseIssueGridOptionsParams) {
  const exportInspectionIssuesAsXlsx =
    createVxePhotoXlsxExportMethod<InspectionGridRow>({
      sheetName: t('qms.inspection.issues.title'),
      filename: () => `${t('qms.inspection.issues.title')}-${Date.now()}.xlsx`,
      getPhotoUrl: (row) => row.photoExportUrl || '',
      getRows: async ({ mode, $table, $grid }) => {
        if (mode === 'selected') {
          return normalizeInspectionRows($table.getCheckboxRecords() || []);
        }
        if (mode === 'all') {
          const proxyInfo = $grid?.getProxyInfo?.();
          const formValues = proxyInfo?.form || {};
          const filterParams: Record<string, unknown[]> = {};
          (proxyInfo?.filter || []).forEach((item: GridFilterItem) => {
            const values = item.values;
            if (values && values.length > 0) {
              filterParams[item.field] = values;
            }
          });
          const { items } = await getInspectionIssues({
            year: currentYear.value,
            workOrderNumber: formValues?.workOrderNumber as string,
            projectName: formValues?.projectName as string,
            status: (filterParams.status?.[0] || formValues?.status) as string,
            processName: formValues?.processName as string,
            ...(filterParams as Record<string, string | string[] | unknown>),
          });
          return normalizeInspectionRows(items || []);
        }
        const tableData = $table.getTableData?.();
        return normalizeInspectionRows(tableData?.fullData || []);
      },
    });

  const gridOptions = computed<VxeGridProps['gridOptions']>(() => ({
    checkboxConfig: {
      reserve: true,
      highlight: true,
    },
    toolbarConfig: {
      export: true,
      refresh: true,
      import: canImport.value,
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
      exportMethod: exportInspectionIssuesAsXlsx,
      types: ['xlsx'],
      modes: ['current', 'selected', 'all'],
    },
    columns: [
      { type: 'checkbox', width: 50 },
      ...(gridColumns || []).map((col) => {
        if (col.field === 'status') {
          return {
            ...col,
            filters: [
              { label: t('qms.inspection.issues.status.open'), value: 'OPEN' },
              {
                label: t('qms.inspection.issues.status.in_progress'),
                value: 'IN_PROGRESS',
              },
              {
                label: t('qms.inspection.issues.status.resolved'),
                value: 'RESOLVED',
              },
              {
                label: t('qms.inspection.issues.status.closed'),
                value: 'CLOSED',
              },
            ],
          };
        }
        if (col.field === 'severity') {
          return {
            ...col,
            filters: [
              { label: 'Critical', value: 'Critical' },
              { label: 'Major', value: 'Major' },
              { label: 'Minor', value: 'Minor' },
            ],
          };
        }
        if (col.field === 'defectType') {
          return {
            ...col,
            filters: [
              { label: '外观问题', value: '外观问题' },
              { label: '尺寸问题', value: '尺寸问题' },
              { label: '功能问题', value: '功能问题' },
              { label: '材料问题', value: '材料问题' },
              { label: '包装问题', value: '包装问题' },
              { label: '其他', value: '其他' },
            ],
          };
        }

        if (col.field === 'division' || col.field === 'responsibleDepartment') {
          return {
            ...col,
            formatter: ({ cellValue }: { cellValue: string | unknown }) => {
              if (!cellValue) return '';
              const name = findNameById(deptRawData.value, cellValue as string);
              return name || (cellValue as string);
            },
          };
        }

        if (col.field === 'updatedAt' || col.field === 'reportDate') {
          return {
            ...col,
            formatter: ({ cellValue }: { cellValue: string | unknown }) => {
              if (!cellValue) return '';
              const format =
                col.field === 'reportDate'
                  ? 'YYYY-MM-DD'
                  : 'YYYY-MM-DD HH:mm:ss';
              const date = dayjs(cellValue as Date | number | string);
              return date.isValid()
                ? date.format(format)
                : (cellValue as string);
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
                  row: InspectionIssue;
                }) => {
                  if (code === 'edit') handleEdit(row);
                  if (code === 'delete') handleDelete(row);
                  if (code === 'settle') handleSettleToKnowledge(row);
                },
              },
            },
          };
        }
        return col;
      }),
    ],
    pagerConfig: {
      enabled: true,
      pageSize: 20,
      pageSizes: [10, 20, 30, 50, 100],
    },
    sortConfig: {
      remote: true,
      trigger: 'cell',
    },
    filterConfig: {
      remote: true,
    },
    proxyConfig: {
      autoLoad: true,
      sort: true,
      filter: true,
      props: {
        result: 'items',
        total: 'total',
      },
      ajax: {
        query: async (
          {
            page,
            sorts,
            filters,
          }: {
            filters: GridFilterItem[];
            page: { currentPage?: number; pageSize?: number };
            sorts: Array<{ field?: string; order?: 'asc' | 'desc' }>;
          },
          formValues: Record<string, unknown> = {},
        ) => {
          const sortParam = sorts?.[0];

          const filterParams: Record<string, unknown[]> = {};
          filters?.forEach((item) => {
            const values = item.values;
            if (values && values.length > 0) {
              filterParams[item.field] = values;
            }
          });

          const { items, total } = await getInspectionIssues({
            page: page?.currentPage || 1,
            pageSize: page?.pageSize || 20,
            sortBy: sortParam?.field,
            sortOrder: sortParam?.order,
            year: currentYear.value,
            workOrderNumber: formValues?.workOrderNumber as string,
            projectName: formValues?.projectName as string,
            status: (filterParams.status?.[0] || formValues?.status) as string,
            ...filterParams,
            processName: formValues?.processName as string,
          });

          return { items, total };
        },
        queryAll: async ({ form }: { form: Record<string, unknown> }) => {
          const formValues = form || {};
          const { items } = await getInspectionIssues({
            year: currentYear.value,
            workOrderNumber: formValues?.workOrderNumber as string,
            projectName: formValues?.projectName as string,
            status: formValues?.status as string,
            processName: formValues?.processName as string,
          });
          return { items };
        },
      },
    },
  }));

  return {
    gridOptions,
  };
}
