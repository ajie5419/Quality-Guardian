import type { VbenFormSchema } from '#/adapter/form';
import type { VxeGridProps } from '#/adapter/vxe-table';
import type { WorkOrderStatusEnum } from '#/api/qms/enums';
import type { TreeSelectNode } from '#/types';

import { $t } from '@vben/locales';

import { z } from '#/adapter/form';

import { WORK_ORDER_STATUS_UI_MAP } from './constants';

/**
 * 工单表单验证 Schema (使用 Zod 强类型校验)
 * 支持多语言错误提示，字段规则与业务强绑定
 */
export const workOrderSchema = z.object({
  // 工单号：必填
  workOrderNumber: z
    .string()
    .min(1, { message: $t('ui.formRules.required') }),
  // 事业部：必填
  division: z.string().min(1, { message: $t('ui.formRules.selectRequired') }),
  // 项目名称：必填，限制长度
  projectName: z
    .string()
    .min(1, { message: $t('ui.formRules.required') })
    .max(100, { message: $t('ui.formRules.maxLength', { length: 100 }) }),
  // 客户名称：必填，限制长度
  customerName: z
    .string()
    .min(1, { message: $t('ui.formRules.required') })
    .max(100, { message: $t('ui.formRules.maxLength', { length: 100 }) }),
  // 数量：必填，最小值1，最大值999999
  quantity: z
    .number({ required_error: $t('ui.formRules.required') })
    .min(1, { message: $t('ui.formRules.minValue', { value: 1 }) })
    .max(999999, { message: $t('ui.formRules.maxValue', { value: 999999 }) }),
  // 交货日期：必填
  deliveryDate: z
    .string()
    .min(1, { message: $t('ui.formRules.selectRequired') }),
  // 生效时间：必填
  effectiveTime: z
    .string()
    .min(1, { message: $t('ui.formRules.selectRequired') }),
  // 状态：必填
  status: z.string().min(1, { message: $t('ui.formRules.selectRequired') }),
});

/**
 * 工单表单值类型
 */
export type WorkOrderFormValues = z.infer<typeof workOrderSchema>;

/**
 * 获取表单配置 Schema
 * @param deptTreeData 部门树形数据
 */
export const getFormSchema = (
  deptTreeData: TreeSelectNode[],
): VbenFormSchema[] => [
  {
    fieldName: 'workOrderNumber',
    label: $t('qms.workOrder.workOrderNumber'),
    component: 'Input',
    componentProps: {
      placeholder: $t('common.pleaseInput'),
      maxLength: 30,
      showCount: true,
    },
    colProps: { span: 24 },
    rules: 'required',
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
      treeNodeFilterProp: 'title',
    },
    colProps: { span: 24 },
    rules: 'required',
  },
  {
    fieldName: 'customerName',
    label: $t('qms.workOrder.customerName'),
    component: 'Input',
    componentProps: {
      placeholder: $t('common.pleaseInput'),
      maxLength: 100,
      showCount: true,
    },
    colProps: { span: 24 },
    rules: 'required',
  },
  {
    fieldName: 'projectName',
    label: $t('qms.workOrder.projectName'),
    component: 'Input',
    componentProps: {
      placeholder: $t('common.pleaseInput'),
      maxLength: 100,
      showCount: true,
    },
    colProps: { span: 24 },
    rules: 'required',
  },
  {
    fieldName: 'quantity',
    label: $t('qms.workOrder.quantity'),
    component: 'InputNumber',
    componentProps: {
      min: 1,
      max: 999999,
      style: { width: '100%' },
      precision: 0,
    },
    colProps: { span: 12 },
    rules: 'required',
  },
  {
    fieldName: 'status',
    label: $t('common.status'),
    component: 'Select',
    componentProps: {
      options: Object.entries(WORK_ORDER_STATUS_UI_MAP)
        .map(([key, value]) => ({
          label: $t(value.textKey || ''),
          value: key,
        }))
        .filter((option) => option.label),
      placeholder: $t('common.pleaseSelect'),
    },
    colProps: { span: 12 },
    rules: 'required',
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
    rules: 'required',
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
    rules: 'required',
  },
];

/**
 * 获取表格列配置
 */
export const getGridColumns = (
  options: {
    showCreateTime?: boolean;
    actionWidth?: number;
  } = { showCreateTime: true, actionWidth: 150 },
): VxeGridProps['columns'] => {
  const baseColumns: VxeGridProps['columns'] = [
    {
      type: 'seq',
      title: $t('common.seq'),
      width: 60,
      align: 'center',
    },
    {
      field: 'workOrderNumber',
      title: $t('qms.workOrder.workOrderNumber'),
      minWidth: 120,
      sortable: true,
    },
    {
      field: 'division',
      title: $t('qms.workOrder.division'),
      minWidth: 120,
      slots: { default: 'division' },
      sortable: true,
    },
    {
      field: 'projectName',
      title: $t('qms.workOrder.projectName'),
      minWidth: 150,
      sortable: true,
      formatter: ({ cellValue }: { cellValue: any }) => cellValue || '-',
    },
    {
      field: 'customerName',
      title: $t('qms.workOrder.customerName'),
      minWidth: 150,
      sortable: true,
      formatter: ({ cellValue }: { cellValue: any }) => cellValue || '-',
    },
    {
      field: 'quantity',
      title: $t('qms.workOrder.quantity'),
      width: 100,
      align: 'right',
      sortable: true,
    },
    {
      field: 'deliveryDate',
      title: $t('qms.workOrder.deliveryDate'),
      width: 120,
      sortable: true,
      formatter: ({ cellValue }: { cellValue: any }) => {
        if (!cellValue) return '-';
        const date = new Date(cellValue);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      },
    },
    {
      field: 'effectiveTime',
      title: $t('qms.workOrder.effectiveTime'),
      width: 120,
      sortable: true,
      formatter: ({ cellValue }: { cellValue: any }) => {
        if (!cellValue) return '-';
        const date = new Date(cellValue);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      },
    },
    {
      field: 'status',
      title: $t('common.status'),
      width: 120,
      slots: { default: 'status' },
      sortable: true,
      // 为状态列开启筛选，并提供选项数组
      filters: Object.entries(WORK_ORDER_STATUS_UI_MAP).map(
        ([key, value]) => ({
          label: $t(value.textKey || ''),
          value: key,
        }),
      ),
    },
  ];

  if (options.showCreateTime) {
    baseColumns.push({
      field: 'createTime',
      title: $t('qms.workOrder.createTime'),
      width: 160,
      sortable: true,
    });
  }

  baseColumns.push({
    title: $t('common.action'),
    width: options.actionWidth,
    fixed: 'right',
    slots: { default: 'action' },
    align: 'center',
  });

  return baseColumns;
};
