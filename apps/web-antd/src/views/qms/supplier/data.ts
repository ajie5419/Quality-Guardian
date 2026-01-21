import type { VxeGridProps } from '#/adapter/vxe-table';

import { $t } from '@vben/locales';

/**
 * 供应商/外协单位状态选项
 */
export const getStatusOptions = () => [
  { label: $t('qms.supplier.status.qualified'), value: 'Qualified' },
  { label: $t('qms.supplier.status.trial'), value: 'Trial' },
  { label: $t('qms.supplier.status.observation'), value: 'Observation' },
  { label: $t('qms.supplier.status.frozen'), value: 'Frozen' },
];

/**
 * 获取表格列配置
 * @param category 类型
 */
export const getColumns = (
  category: 'Outsourcing' | 'Supplier',
): VxeGridProps['columns'] => [
  { type: 'checkbox', width: 60, fixed: 'left' },
  { type: 'seq', title: $t('common.seq'), width: 60, fixed: 'left' },
  {
    field: 'name',
    title:
      category === 'Supplier'
        ? $t('qms.supplier.name')
        : $t('qms.outsourcing.unitName'),
    minWidth: 200,
    sortable: true,
    fixed: 'left',
    slots: { default: 'name_link' },
  },
  {
    field: 'brand',
    title:
      category === 'Supplier'
        ? $t('qms.supplier.brand')
        : $t('qms.outsourcing.serviceRange'),
    width: 120,
    sortable: true,
  },
  {
    field: 'status',
    title: $t('common.status'),
    width: 100,
    sortable: true,
    slots: { default: 'status_badge' },
  },
  {
    field: 'level',
    title: $t('qms.supplier.qualityLevel'),
    width: 100,
    sortable: true,
    slots: { default: 'level_tag' },
  },
  {
    field: 'qualityScore',
    title: $t('qms.supplier.realTimeScore'),
    width: 100,
    sortable: true,
    slots: { default: 'score_tag' },
  },
  {
    field: 'incomingQualifiedRate',
    title: $t('qms.supplier.qualifiedRate'),
    width: 100,
    sortable: true,
    formatter: ({ cellValue }) => `${cellValue ?? 0}%`,
  },
  {
    field: 'engineeringIssueCount',
    title: $t('qms.supplier.engIssue'),
    width: 100,
    sortable: true,
    slots: { default: 'eng_issue' },
  },
  {
    field: 'afterSalesIssueCount',
    title: $t('qms.supplier.afterSalesIssue'),
    width: 100,
    sortable: true,
    slots: { default: 'issue_count' },
  },
  {
    field: 'buyer',
    title:
      category === 'Supplier'
        ? $t('qms.supplier.buyer')
        : $t('common.responsible'),
    width: 100,
    sortable: true,
  },
  {
    title: $t('common.action'),
    width: 150,
    fixed: 'right',
    slots: { default: 'action' },
  },
];

/**
 * 获取表单配置
 * @param category 类型
 */
export const getFormSchema = (category: 'Outsourcing' | 'Supplier'): any[] => [
  {
    fieldName: 'name',
    label:
      category === 'Supplier'
        ? $t('qms.supplier.name')
        : $t('qms.outsourcing.unitName'),
    component: 'Input',
    rules: 'required',
    colProps: { span: 12 },
  },
  {
    fieldName: 'brand',
    label:
      category === 'Supplier'
        ? $t('qms.supplier.brand')
        : $t('qms.outsourcing.serviceRange'),
    component: 'Input',
    colProps: { span: 12 },
  },
  {
    fieldName: 'category',
    label: $t('common.type'),
    component: 'Input',
    defaultValue: category,
    componentProps: {
      disabled: true,
    },
    colProps: { span: 12 },
  },
  {
    fieldName: 'productName',
    label:
      category === 'Supplier'
        ? $t('qms.supplier.mainProduct')
        : $t('qms.outsourcing.mainProcessing'),
    component: 'Input',
    colProps: { span: 12 },
  },
  {
    fieldName: 'status',
    label: $t('common.status'),
    component: 'Select',
    componentProps: {
      options: getStatusOptions(),
    },
    defaultValue: 'Qualified',
    colProps: { span: 12 },
  },
  {
    fieldName: 'buyer',
    label:
      category === 'Supplier'
        ? $t('qms.supplier.buyer')
        : $t('common.responsible'),
    component: 'Input',
    colProps: { span: 12 },
  },
];

/**
 * 获取搜索表单配置
 * @param category 类型
 */
export const getSearchFormSchema = (
  category: 'Outsourcing' | 'Supplier',
): any[] => [
  {
    fieldName: 'name',
    label:
      category === 'Supplier'
        ? $t('qms.supplier.name')
        : $t('qms.outsourcing.unitName'),
    component: 'Input',
    colProps: { span: 6 },
  },
  {
    fieldName: 'status',
    label: $t('common.status'),
    component: 'Select',
    componentProps: {
      options: getStatusOptions(),
    },
    colProps: { span: 6 },
  },
];
