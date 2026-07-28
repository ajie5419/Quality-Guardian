import type { StatusOption } from './constants';

import type { VbenFormSchema } from '#/adapter/form';
import type { VxeGridProps } from '#/adapter/vxe-table';

import { InspectionIssueStatusEnum } from '@qgs/shared';

import { $t } from '#/locales';

export function getIssueSearchFormSchema(
  statusOptions: StatusOption[] = [
    {
      value: InspectionIssueStatusEnum.OPEN,
      label: $t('qms.inspection.issues.status.open'),
      color: 'red',
    },
    {
      value: InspectionIssueStatusEnum.IN_PROGRESS,
      label: $t('qms.inspection.issues.status.inProgress'),
      color: 'orange',
    },
    {
      value: InspectionIssueStatusEnum.CLOSED,
      label: $t('qms.inspection.issues.status.closed'),
      color: 'green',
    },
  ],
  processOptions: Array<{ label: string; value: string }> = [],
): VbenFormSchema[] {
  const statusSearchOptions = [
    { label: $t('common.all'), value: '' },
    ...statusOptions.map((item) => ({
      label: item.label,
      value: item.value,
    })),
  ];

  return [
    {
      fieldName: 'workOrderNumber',
      label: $t('qms.workOrder.workOrderNumber'),
      component: 'Input',
      colProps: { span: 6 },
    },
    {
      fieldName: 'projectName',
      label: $t('qms.workOrder.projectName'),
      component: 'Input',
      colProps: { span: 6 },
    },
    {
      fieldName: 'supplierName',
      label: $t('qms.inspection.issues.responsibleUnit'),
      component: 'Input',
      colProps: { span: 6 },
    },
    {
      fieldName: 'responsibleDepartment',
      label: $t('qms.inspection.issues.responsibleDepartment'),
      component: 'Input',
      colProps: { span: 6 },
    },
    {
      fieldName: 'responsibleWelder',
      label: $t('qms.inspection.issues.responsibleWelder'),
      component: 'Input',
      colProps: { span: 6 },
    },
    {
      fieldName: 'status',
      label: $t('common.status'),
      component: 'Select',
      componentProps: {
        options: statusSearchOptions,
      },
      colProps: { span: 4 },
    },
    {
      fieldName: 'processName',
      label: $t('qms.inspection.issues.processName'),
      component: 'Select',
      componentProps: {
        options: processOptions,
        allowClear: true,
        showSearch: true,
      },
      colProps: { span: 4 },
    },
    {
      fieldName: 'dateRange',
      label: $t('qms.inspection.issues.reportDate'),
      component: 'RangePicker',
      componentProps: {
        allowClear: true,
        style: { width: '100%' },
        valueFormat: 'YYYY-MM-DD',
      },
      colProps: { span: 8 },
    },
  ] as unknown as VbenFormSchema[];
}

export const gridColumns: VxeGridProps['columns'] = [
  { type: 'seq', title: $t('common.seq'), width: 60, fixed: 'left' as const },
  {
    field: 'reportDate',
    title: $t('qms.inspection.issues.reportDate'),
    width: 120,
    sortable: true,
  },
  {
    field: 'workOrderNumber',
    title: $t('qms.workOrder.workOrderNumber'),
    width: 140,
    sortable: true,
  },
  {
    field: 'division',
    title: $t('qms.workOrder.division'),
    width: 120,
    sortable: true,
  },
  {
    field: 'defectType',
    title: $t('qms.inspection.issues.defectType'),
    width: 120,
    sortable: true,
  },
  {
    field: 'processName',
    title: $t('qms.inspection.issues.processName'),
    width: 120,
    sortable: true,
  },
  {
    field: 'defectSubtype',
    title: $t('qms.inspection.issues.defectSubtype'),
    width: 120,
  },
  {
    field: 'severity',
    title: $t('qms.inspection.issues.severity'),
    width: 100,
    slots: { default: 'severity' },
  },
  {
    field: 'status',
    title: $t('common.status'),
    width: 100,
    slots: { default: 'status' },
    sortable: true,
  },
  {
    field: 'projectName',
    title: $t('qms.workOrder.projectName'),
    width: 150,
  },
  {
    field: 'partName',
    title: $t('qms.inspection.issues.partName'),
    width: 150,
  },
  {
    field: 'ncNumber',
    title: $t('qms.inspection.issues.ncNumber'),
    width: 140,
  },
  {
    field: 'description',
    title: $t('qms.inspection.issues.description'),
    width: 200,
    showOverflow: true,
  },
  {
    field: 'quantity',
    title: $t('qms.workOrder.quantity'),
    width: 80,
    sortable: true,
  },
  {
    field: 'rootCause',
    title: $t('qms.inspection.issues.rootCause'),
    width: 200,
    showOverflow: true,
  },
  {
    field: 'solution',
    title: $t('qms.inspection.issues.solution'),
    width: 200,
    showOverflow: true,
  },
  {
    field: 'lossAmount',
    title: $t('qms.inspection.issues.lossAmount'),
    width: 120,
    sortable: true,
  },
  {
    field: 'responsibleDepartment',
    title: $t('qms.inspection.issues.responsibleDepartment'),
    width: 120,
  },
  {
    field: 'responsibleWelder',
    title: $t('qms.inspection.issues.responsibleWelder'),
    width: 120,
  },
  {
    field: 'supplierName',
    title: $t('qms.inspection.issues.responsibleUnit'),
    width: 180,
  },
  {
    field: 'inspector',
    title: $t('qms.inspection.issues.reportedBy'),
    width: 120,
  },
  {
    field: 'claim',
    title: $t('qms.inspection.issues.claim'),
    width: 100,
    slots: { default: 'claim' },
  },
  {
    field: 'photos',
    title: $t('qms.inspection.issues.photos'),
    width: 80,
    slots: { default: 'photos' },
  },
  {
    field: 'updatedAt',
    title: $t('qms.inspection.issues.updatedAt'),
    width: 160,
    sortable: true,
  },
  {
    title: $t('common.action'),
    width: 150,
    fixed: 'right' as const,
    slots: { default: 'action' },
  },
];
