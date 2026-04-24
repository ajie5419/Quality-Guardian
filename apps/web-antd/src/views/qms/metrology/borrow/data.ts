import type { VbenFormSchema } from '#/adapter/form';
import type { VxeGridProps } from '#/adapter/vxe-table';

import { $t } from '@vben/locales';

export const getBorrowStatusOptions = () => [
  { label: $t('qms.metrology.borrow.status.borrowed'), value: 'BORROWED' },
  { label: $t('qms.metrology.borrow.status.overdue'), value: 'OVERDUE' },
  {
    label: $t('qms.metrology.borrow.status.returnPending'),
    value: 'RETURN_PENDING',
  },
  { label: $t('qms.metrology.borrow.status.returned'), value: 'RETURNED' },
];

export const getColumns = (): VxeGridProps['columns'] => [
  {
    field: 'instrumentName',
    title: $t('qms.metrology.instrumentName'),
    minWidth: 180,
    sortable: true,
  },
  {
    field: 'instrumentCode',
    title: $t('qms.metrology.instrumentCode'),
    minWidth: 140,
    sortable: true,
  },
  {
    field: 'model',
    title: $t('qms.metrology.model'),
    minWidth: 130,
    sortable: true,
  },
  {
    field: 'usingUnit',
    title: $t('qms.metrology.usingUnit'),
    minWidth: 120,
    sortable: true,
  },
  {
    field: 'borrowerDepartment',
    title: $t('qms.metrology.borrow.borrowerDepartment'),
    minWidth: 120,
    sortable: true,
  },
  {
    field: 'borrowerName',
    title: $t('qms.metrology.borrow.borrowerName'),
    minWidth: 110,
    sortable: true,
  },
  {
    field: 'borrowedAt',
    title: $t('qms.metrology.borrow.borrowedAt'),
    width: 130,
    sortable: true,
  },
  {
    field: 'expectedReturnAt',
    title: $t('qms.metrology.borrow.expectedReturnAt'),
    width: 130,
    sortable: true,
  },
  {
    field: 'returnedAt',
    title: $t('qms.metrology.borrow.returnedAt'),
    width: 130,
    sortable: true,
  },
  {
    field: 'statusLabel',
    title: $t('qms.metrology.borrow.status.label'),
    width: 120,
    slots: { default: 'status' },
  },
  {
    title: $t('common.action'),
    width: 120,
    fixed: 'right',
    slots: { default: 'action' },
  },
];

type BorrowSearchFormSchema = VbenFormSchema & {
  colProps?: { span: number };
};

export const getSearchFormSchema = (): BorrowSearchFormSchema[] => [
  {
    fieldName: 'keyword',
    label: $t('qms.metrology.borrow.keyword'),
    component: 'Input',
    colProps: { span: 6 },
  },
  {
    fieldName: 'borrowerDepartment',
    label: $t('qms.metrology.borrow.borrowerDepartment'),
    component: 'Input',
    colProps: { span: 6 },
  },
  {
    fieldName: 'borrowerName',
    label: $t('qms.metrology.borrow.borrowerName'),
    component: 'Input',
    colProps: { span: 6 },
  },
  {
    fieldName: 'status',
    label: $t('qms.metrology.borrow.status.label'),
    component: 'Select',
    componentProps: {
      allowClear: true,
      options: getBorrowStatusOptions(),
    },
    colProps: { span: 6 },
  },
];
