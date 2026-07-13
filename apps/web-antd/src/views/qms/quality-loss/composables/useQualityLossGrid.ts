import type { ComputedRef, Ref } from 'vue';

import type { VxeGridProps } from '#/adapter/vxe-table';
import type { QmsQualityLossApi } from '#/api/qms/quality-loss';

import { computed } from 'vue';

import { findNameById } from '#/types';
import { resolveQmsStatusUi } from '#/views/qms/shared/utils/status-ui';

import { LossSource } from '../types';

type QualityLossItem = QmsQualityLossApi.QualityLossItem;
type QualityLossListResult = {
  items: QualityLossItem[];
  total: number;
};
type QualityLossFormOption = { color?: string; label: string; value: string };

function getLossSourceOptions(t: (key: string) => string) {
  return [
    { label: t('common.all'), value: '' },
    {
      label: t('qms.qualityLoss.source.manual'),
      value: LossSource.MANUAL,
    },
    {
      label: t('qms.qualityLoss.source.internal'),
      value: LossSource.INTERNAL,
    },
    {
      label: t('qms.qualityLoss.source.external'),
      value: LossSource.EXTERNAL,
    },
    {
      label: t('qms.qualityLoss.source.commissioning'),
      value: LossSource.COMMISSIONING,
    },
  ];
}

function buildQualityLossFormSchema(
  t: (key: string) => string,
  statusOptions: QualityLossFormOption[],
) {
  return [
    {
      fieldName: 'workOrderNumber',
      label: t('qms.workOrder.workOrderNumber'),
      component: 'Input',
      colProps: { span: 6 },
    },
    {
      fieldName: 'lossSource',
      label: t('qms.qualityLoss.source.label'),
      component: 'Select',
      componentProps: {
        options: getLossSourceOptions(t),
      },
      colProps: { span: 6 },
    },
    {
      fieldName: 'status',
      label: t('common.status'),
      component: 'Select',
      componentProps: {
        options: statusOptions,
      },
      colProps: { span: 6 },
    },
  ];
}

export function useQualityLossGrid(params: {
  canDelete: Ref<boolean>;
  canEdit: Ref<boolean>;
  canExport: Ref<boolean>;
  deptRawData: Ref<any[]>;
  exportQualityLossAsXlsx: NonNullable<
    VxeGridProps<QualityLossItem>['exportConfig']
  >['exportMethod'];
  getQualityLossList: (
    params: Record<string, unknown>,
  ) => Promise<QualityLossListResult>;
  handleClaim: (row: QualityLossItem) => void;
  handleDelete: (row: QualityLossItem) => void;
  handleEdit: (row: QualityLossItem) => void;
  qualityLossStatusOptions: Ref<QualityLossFormOption[]>;
  refreshOverview: (filters?: Record<string, unknown>) => Promise<void>;
  t: (key: string) => string;
}) {
  const {
    canDelete,
    canEdit,
    canExport,
    deptRawData,
    exportQualityLossAsXlsx,
    getQualityLossList,
    handleClaim,
    handleDelete,
    handleEdit,
    qualityLossStatusOptions,
    refreshOverview,
    t,
  } = params;

  const formSchema = computed(() =>
    buildQualityLossFormSchema(t, qualityLossStatusOptions.value),
  );

  const gridOptions = computed<VxeGridProps<QualityLossItem>>(() => ({
    checkboxConfig: {
      reserve: true,
      highlight: true,
      range: true,
    },
    toolbarConfig: {
      slots: { buttons: 'toolbar-actions' },
      export: canExport.value,
      search: true,
      zoom: true,
      refresh: true,
      custom: true,
    },
    exportConfig: {
      remote: true,
      exportMethod: exportQualityLossAsXlsx,
      types: ['xlsx'],
      modes: ['current', 'selected', 'all'],
    },
    columns: [
      { type: 'checkbox', width: 50, fixed: 'left' },
      { type: 'seq', title: t('common.seq'), width: 60, fixed: 'left' },
      {
        field: 'lossSource',
        title: t('qms.qualityLoss.source.label'),
        width: 100,
        slots: { default: 'lossSource' },
      },
      {
        field: 'workOrderNumber',
        title: t('qms.workOrder.workOrderNumber'),
        width: 120,
        formatter: ({ cellValue }) => cellValue || '-',
      },
      {
        field: 'projectName',
        title: t('qms.workOrder.projectName'),
        minWidth: 150,
        formatter: ({ cellValue }) => cellValue || '-',
      },
      {
        field: 'partName',
        title: t('qms.inspection.issues.partName'),
        minWidth: 150,
        formatter: ({ cellValue }) => cellValue || '-',
      },
      {
        field: 'date',
        title: t('qms.inspection.issues.reportDate'),
        width: 120,
      },
      {
        field: 'amount',
        title: t('qms.inspection.issues.lossAmount'),
        width: 130,
        formatter: ({ cellValue }) => `¥${Number(cellValue).toLocaleString()}`,
      },
      {
        field: 'actualClaim',
        title: t('qms.qualityLoss.actualClaim'),
        width: 130,
        formatter: ({ cellValue }) =>
          `¥${Number(cellValue || 0).toLocaleString()}`,
      },
      {
        field: 'responsibleDepartment',
        title: t('qms.inspection.issues.responsibleDepartment'),
        width: 140,
        formatter: ({ cellValue }) => {
          if (!cellValue) return '';
          return findNameById(deptRawData.value, cellValue) || cellValue;
        },
      },
      {
        field: 'status',
        title: t('common.status'),
        width: 100,
        slots: { default: 'status' },
      },
      {
        title: t('common.action'),
        width: 130,
        fixed: 'right',
        cellRender: {
          name: 'CellOperation',
          props: {
            options: (row: QualityLossItem) => [
              {
                code: 'claim',
                icon: 'ant-design:solution-outlined',
                label: '索赔',
                type: 'primary',
                ghost: true,
              },
              ...(canEdit.value ? ['edit'] : []),
              ...(canDelete.value && row.lossSource === LossSource.MANUAL
                ? ['delete']
                : []),
            ],
            onClick: ({
              code,
              row,
            }: {
              code: string;
              row: QualityLossItem;
            }) => {
              if (code === 'claim') handleClaim(row);
              if (code === 'edit') handleEdit(row);
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
          const [result] = await Promise.all([
            getQualityLossList(params),
            refreshOverview(form),
          ]);
          return result;
        },
      },
    },
  }));

  function getStatusConfig(status: string) {
    return (
      qualityLossStatusOptions.value.find((item) => item.value === status) || {
        label: resolveQmsStatusUi(status, 'quality-loss').text,
        color: resolveQmsStatusUi(status, 'quality-loss').color,
      }
    );
  }

  return {
    formSchema: formSchema as ComputedRef<any[]>,
    gridOptions,
    getStatusConfig,
  };
}
