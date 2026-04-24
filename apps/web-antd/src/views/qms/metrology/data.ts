import type { VbenFormSchema } from '#/adapter/form';
import type { VxeGridProps } from '#/adapter/vxe-table';

import { $t } from '@vben/locales';

export const getStatusOptions = () => [
  { label: $t('qms.metrology.status.valid'), value: 'VALID' },
  { label: $t('qms.metrology.status.expired'), value: 'EXPIRED' },
  { label: $t('qms.metrology.status.pending'), value: 'PENDING' },
  { label: $t('qms.metrology.status.disabled'), value: 'DISABLED' },
];

export const getColumns = (): VxeGridProps['columns'] => [
  {
    type: 'checkbox',
    width: 60,
    fixed: 'left',
  },
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
    minWidth: 150,
    sortable: true,
  },
  {
    field: 'usingUnit',
    title: $t('qms.metrology.usingUnit'),
    minWidth: 150,
    sortable: true,
  },
  {
    field: 'validUntil',
    title: $t('qms.metrology.validUntil'),
    width: 130,
    sortable: true,
  },
  {
    field: 'remainingDays',
    title: $t('qms.metrology.remainingDays'),
    width: 120,
    slots: { default: 'remaining_days' },
  },
  {
    field: 'inspectionStatusLabel',
    title: $t('qms.metrology.inspectionStatus'),
    width: 120,
    slots: { default: 'inspection_status' },
  },
  {
    field: 'borrowStatusLabel',
    title: $t('qms.metrology.borrowStatus'),
    width: 120,
    slots: { default: 'borrow_status' },
  },
  {
    title: $t('common.action'),
    width: 160,
    fixed: 'right',
    slots: { default: 'action' },
  },
];

type MetrologySearchFormSchema = VbenFormSchema & {
  colProps?: { span: number };
};

export const getSearchFormSchema = (): MetrologySearchFormSchema[] => [
  {
    fieldName: 'instrumentName',
    label: $t('qms.metrology.instrumentName'),
    component: 'Input',
    colProps: { span: 6 },
  },
  {
    fieldName: 'instrumentCode',
    label: $t('qms.metrology.instrumentCode'),
    component: 'Input',
    colProps: { span: 6 },
  },
  {
    fieldName: 'model',
    label: $t('qms.metrology.model'),
    component: 'Input',
    colProps: { span: 6 },
  },
  {
    fieldName: 'usingUnit',
    label: $t('qms.metrology.usingUnit'),
    component: 'Input',
    colProps: { span: 6 },
  },
  {
    fieldName: 'inspectionStatus',
    label: $t('qms.metrology.inspectionStatus'),
    component: 'Select',
    componentProps: {
      options: getStatusOptions(),
      allowClear: true,
    },
    colProps: { span: 6 },
  },
  {
    fieldName: 'validFrom',
    label: $t('qms.metrology.validFrom'),
    component: 'DatePicker',
    componentProps: {
      valueFormat: 'YYYY-MM-DD',
    },
    colProps: { span: 6 },
  },
  {
    fieldName: 'validTo',
    label: $t('qms.metrology.validTo'),
    component: 'DatePicker',
    componentProps: {
      valueFormat: 'YYYY-MM-DD',
    },
    colProps: { span: 6 },
  },
];

export const getEditStatusOptions = () => [
  { label: $t('qms.metrology.status.valid'), value: 'VALID' },
  { label: $t('qms.metrology.status.expired'), value: 'EXPIRED' },
  { label: $t('qms.metrology.status.pending'), value: 'PENDING' },
  { label: $t('qms.metrology.status.disabled'), value: 'DISABLED' },
];
