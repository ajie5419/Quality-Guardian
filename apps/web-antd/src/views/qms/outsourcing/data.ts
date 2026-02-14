import type { VbenFormSchema } from '#/adapter/form';
import type { VxeGridProps } from '#/adapter/vxe-table';

import { $t } from '@vben/locales';

export const columns: VxeGridProps['columns'] = [
  { type: 'checkbox', width: 60, fixed: 'left' },
  { type: 'seq', title: $t('common.seq'), width: 60, fixed: 'left' },
  {
    field: 'name',
    title: $t('qms.outsourcing.unitName'),
    minWidth: 200,
    sortable: true,
    fixed: 'left',
    slots: { default: 'name_link' },
  },
  {
    field: 'brand',
    title: $t('qms.outsourcing.serviceRange'),
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
    title: $t('qms.outsourcing.qualityLevel'),
    width: 100,
    sortable: true,
    slots: { default: 'level_tag' },
  },
  {
    field: 'qualityScore',
    title: $t('qms.outsourcing.realTimeScore'),
    width: 100,
    sortable: true,
    slots: { default: 'score_tag' },
  },
  {
    field: 'incomingQualifiedRate',
    title: $t('qms.outsourcing.qualifiedRate'),
    width: 100,
    sortable: true,
    formatter: ({ cellValue }: { cellValue: number | string }) =>
      `${cellValue}%`,
  },
  {
    field: 'engineeringIssueCount',
    title: $t('qms.outsourcing.engIssue'),
    width: 100,
    sortable: true,
    slots: { default: 'eng_issue' },
  },
  {
    field: 'afterSalesIssueCount',
    title: $t('qms.outsourcing.afterSalesIssue'),
    width: 100,
    sortable: true,
    slots: { default: 'issue_count' },
  },
  {
    field: 'buyer',
    title: $t('common.responsible'),
    width: 100,
    sortable: true,
  },
  {
    field: 'productName',
    title: $t('qms.outsourcing.mainProcessing'),
    minWidth: 200,
    sortable: true,
  },
  {
    title: $t('common.action'),
    width: 150,
    fixed: 'right',
    slots: { default: 'action' },
  },
];

type OutsourcingFormSchema = VbenFormSchema & {
  colProps?: { span: number };
};

export const formSchema: OutsourcingFormSchema[] = [
  {
    fieldName: 'name',
    label: '名称',
    component: 'Input',
    rules: 'required',
    colProps: { span: 12 },
  },
  {
    fieldName: 'brand',
    label: '服务范围',
    component: 'Input',
    colProps: { span: 12 },
  },
  {
    fieldName: 'category',
    label: '类别',
    component: 'Input',
    defaultValue: 'Outsourcing',
    colProps: { span: 12 },
  },
  {
    fieldName: 'productName',
    label: '主营内容',
    component: 'Input',
    colProps: { span: 12 },
  },
  {
    fieldName: 'status',
    label: '准入状态',
    component: 'Select',
    componentProps: {
      options: [
        { label: '已准入', value: 'Qualified' },
        { label: '试用期', value: 'Trial' },
        { label: '质量观察', value: 'Observation' },
        { label: '冻结', value: 'Frozen' },
      ],
    },
    defaultValue: 'Qualified',
    colProps: { span: 12 },
  },
  {
    fieldName: 'buyer',
    label: '采购负责人',
    component: 'Input',
    colProps: { span: 12 },
  },
];

export const searchFormSchema: OutsourcingFormSchema[] = [
  {
    fieldName: 'name',
    label: $t('qms.outsourcing.unitName'),
    component: 'Input',
    colProps: { span: 6 },
  },
  {
    fieldName: 'status',
    label: $t('common.status'),
    component: 'Select',
    componentProps: {
      options: [
        { label: '已准入', value: 'Qualified' },
        { label: '试用期', value: 'Trial' },
        { label: '质量观察', value: 'Observation' },
        { label: '冻结', value: 'Frozen' },
      ],
    },
    colProps: { span: 6 },
  },
];
