import { z } from '#/adapter/form';
import type { VbenFormSchema } from '#/adapter/form';
import type { VxeGridProps } from '#/adapter/vxe-table';
import { $t } from '@vben/locales';
import { WORK_ORDER_STATUS_UI_MAP } from './constants';

/**
 * Work Order Form Validation Schema
 */
export const workOrderSchema = z.object({
  workOrderNumber: z.string().min(1, { message: $t('ui.formRules.required') }),
  division: z.string().min(1, { message: $t('ui.formRules.selectRequired') }),
  projectName: z.string().min(1, { message: $t('ui.formRules.required') }),
  customerName: z.string().min(1, { message: $t('ui.formRules.required') }),
  quantity: z.number({ required_error: $t('ui.formRules.required') }).min(1),
  deliveryDate: z.string().min(1, { message: $t('ui.formRules.selectRequired') }),
  effectiveTime: z.string().min(1, { message: $t('ui.formRules.selectRequired') }),
  status: z.string().min(1, { message: $t('ui.formRules.selectRequired') }),
});

export type WorkOrderFormValues = z.infer<typeof workOrderSchema>;

/**
 * Get Form Schema
 * @param deptTreeData Department tree data
 */
export const getFormSchema = (deptTreeData: any[]): VbenFormSchema[] => [
  {
    fieldName: 'workOrderNumber',
    label: $t('qms.workOrder.workOrderNumber'),
    component: 'Input',
    componentProps: {
      placeholder: $t('common.pleaseInput'),
    },
    colProps: { span: 24 },
  },
  {
    fieldName: 'division',
    label: $t('qms.workOrder.division'),
    component: 'TreeSelect',
    componentProps: {
      treeData: deptTreeData,
      placeholder: $t('common.pleaseSelect'),
      treeDefaultExpandAll: true,
      allowClear: true,
    },
    colProps: { span: 24 },
  },
  {
    fieldName: 'customerName',
    label: $t('qms.workOrder.customerName'),
    component: 'Input',
    colProps: { span: 24 },
  },
  {
    fieldName: 'projectName',
    label: $t('qms.workOrder.projectName'),
    component: 'Input',
    colProps: { span: 24 },
  },
  {
    fieldName: 'quantity',
    label: $t('qms.workOrder.quantity'),
    component: 'InputNumber',
    componentProps: {
      min: 1,
      style: { width: '100%' },
    },
    colProps: { span: 12 },
  },
  {
    fieldName: 'status',
    label: $t('common.status'),
    component: 'Select',
    componentProps: {
      options: Object.keys(WORK_ORDER_STATUS_UI_MAP).map((key) => ({
        label: $t(WORK_ORDER_STATUS_UI_MAP[key]!.textKey),
        value: key,
      })),
      placeholder: $t('common.pleaseSelect'),
    },
    colProps: { span: 12 },
  },
  {
    fieldName: 'deliveryDate',
    label: $t('qms.workOrder.deliveryDate'),
    component: 'DatePicker',
    componentProps: {
      valueFormat: 'YYYY-MM-DD',
      style: { width: '100%' },
    },
    colProps: { span: 12 },
  },
  {
    fieldName: 'effectiveTime',
    label: $t('qms.workOrder.effectiveTime'),
    component: 'DatePicker',
    componentProps: {
      valueFormat: 'YYYY-MM-DD',
      style: { width: '100%' },
    },
    colProps: { span: 12 },
  },
];

/**
 * Get Grid Columns
 */
export const getGridColumns = (): VxeGridProps['columns'] => [
  { type: 'seq', title: $t('common.seq'), width: 60 },
  { field: 'workOrderNumber', title: $t('qms.workOrder.workOrderNumber'), minWidth: 120 },
  {
    field: 'division',
    title: $t('qms.workOrder.division'),
    minWidth: 120,
    slots: { default: 'division' },
  },
  { field: 'projectName', title: $t('qms.workOrder.projectName'), minWidth: 150 },
  { field: 'customerName', title: $t('qms.workOrder.customerName'), minWidth: 150 },
  { field: 'quantity', title: $t('qms.workOrder.quantity'), width: 80 },
  { field: 'deliveryDate', title: $t('qms.workOrder.deliveryDate'), width: 120 },
  { field: 'effectiveTime', title: $t('qms.workOrder.effectiveTime'), width: 120 },
  {
    field: 'status',
    title: $t('common.status'),
    width: 100,
    slots: { default: 'status' },
  },
  { field: 'createTime', title: $t('qms.workOrder.createTime'), width: 160 },
  { title: $t('common.action'), width: 150, fixed: 'right', slots: { default: 'action' } },
];
