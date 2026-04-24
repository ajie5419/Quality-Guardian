import type { VbenFormSchema } from '#/adapter/form';
import type { VxeGridProps } from '#/adapter/vxe-table';

import { $t } from '@vben/locales';

export const getCalibrationPlanStatusOptions = () => [
  {
    label: $t('qms.metrology.calibrationPlan.status.planned'),
    value: 'PLANNED',
  },
  {
    label: $t('qms.metrology.calibrationPlan.status.completed'),
    value: 'COMPLETED',
  },
  {
    label: $t('qms.metrology.calibrationPlan.status.overdue'),
    value: 'OVERDUE',
  },
];

export const getMonthOptions = () =>
  Array.from({ length: 12 }, (_, index) => ({
    label: `${index + 1}`,
    value: index + 1,
  }));

export const getViewOptions = () => [
  { label: $t('qms.metrology.calibrationPlan.views.list'), value: 'list' },
  { label: $t('qms.metrology.calibrationPlan.views.grid'), value: 'grid' },
];

export const getColumns = (): VxeGridProps['columns'] => [
  {
    field: 'orderNo',
    title: $t('qms.metrology.orderNo'),
    width: 90,
    sortable: true,
  },
  {
    field: 'instrumentName',
    title: $t('qms.metrology.instrumentName'),
    minWidth: 180,
    sortable: true,
  },
  {
    field: 'instrumentCode',
    title: $t('qms.metrology.instrumentCode'),
    minWidth: 160,
    sortable: true,
  },
  {
    field: 'model',
    title: $t('qms.metrology.model'),
    minWidth: 140,
    sortable: true,
  },
  {
    field: 'usingUnit',
    title: $t('qms.metrology.usingUnit'),
    minWidth: 140,
    sortable: true,
  },
  {
    field: 'planYear',
    title: $t('qms.metrology.calibrationPlan.planYear'),
    width: 110,
    sortable: true,
  },
  {
    field: 'planMonth',
    title: $t('qms.metrology.calibrationPlan.planMonth'),
    width: 100,
    sortable: true,
  },
  {
    field: 'planDay',
    title: $t('qms.metrology.calibrationPlan.planDay'),
    width: 100,
    sortable: true,
  },
  {
    field: 'plannedDate',
    title: $t('qms.metrology.calibrationPlan.plannedDate'),
    width: 130,
    sortable: true,
  },
  {
    field: 'actualDate',
    title: $t('qms.metrology.calibrationPlan.actualDate'),
    width: 130,
    sortable: true,
  },
  {
    field: 'statusLabel',
    title: $t('qms.metrology.calibrationPlan.status.label'),
    width: 120,
    slots: { default: 'status' },
    sortable: true,
  },
  {
    field: 'remark',
    title: $t('qms.metrology.calibrationPlan.remark'),
    minWidth: 180,
  },
  {
    title: $t('common.action'),
    width: 160,
    fixed: 'right',
    slots: { default: 'action' },
  },
];

type SearchFormSchema = VbenFormSchema & { colProps?: { span: number } };

export const getSearchFormSchema = (): SearchFormSchema[] => [
  {
    fieldName: 'year',
    label: $t('qms.metrology.calibrationPlan.planYear'),
    component: 'InputNumber',
    defaultValue: new Date().getFullYear(),
    componentProps: {
      min: 2000,
      max: 2100,
      precision: 0,
    },
    colProps: { span: 6 },
  },
  {
    fieldName: 'month',
    label: $t('qms.metrology.calibrationPlan.planMonth'),
    component: 'Select',
    componentProps: {
      allowClear: true,
      options: getMonthOptions(),
    },
    colProps: { span: 6 },
  },
  {
    fieldName: 'status',
    label: $t('qms.metrology.calibrationPlan.status.label'),
    component: 'Select',
    componentProps: {
      allowClear: true,
      options: getCalibrationPlanStatusOptions(),
    },
    colProps: { span: 6 },
  },
  {
    fieldName: 'usingUnit',
    label: $t('qms.metrology.usingUnit'),
    component: 'Input',
    colProps: { span: 6 },
  },
  {
    fieldName: 'keyword',
    label: $t('common.keyword'),
    component: 'Input',
    componentProps: {
      placeholder: $t('qms.metrology.calibrationPlan.keywordPlaceholder'),
    },
    colProps: { span: 12 },
  },
];
