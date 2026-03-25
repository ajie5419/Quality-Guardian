import type { VbenFormSchema } from '#/adapter/form';
import type { VxeGridProps } from '#/adapter/vxe-table';

import { InspectionIssueStatusEnum } from '#/api/qms/enums';
import { $t } from '#/locales';

export const searchFormSchema: VbenFormSchema[] = [
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
      options: [
        { label: $t('common.all'), value: '' },
        {
          label: $t('qms.inspection.issues.status.open'),
          value: InspectionIssueStatusEnum.OPEN,
        },
        {
          label: $t('qms.inspection.issues.status.inProgress'),
          value: InspectionIssueStatusEnum.IN_PROGRESS,
        },
        {
          label: $t('qms.inspection.issues.status.closed'),
          value: InspectionIssueStatusEnum.CLOSED,
        },
      ],
    },
    colProps: { span: 4 },
  },
  {
    fieldName: 'processName',
    label: $t('qms.inspection.issues.processName'),
    component: 'Select',
    componentProps: {
      options: [
        { label: '设计', value: '设计' },
        { label: '下料', value: '下料' },
        { label: '组对', value: '组对' },
        { label: '焊接', value: '焊接' },
        { label: '机加', value: '机加' },
        { label: '涂装', value: '涂装' },
        { label: '组装', value: '组装' },
        { label: '成品检验', value: '成品检验' },
      ],
    },
    colProps: { span: 4 },
  },
] as unknown as VbenFormSchema[];

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
