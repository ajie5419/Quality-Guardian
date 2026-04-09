import type { VbenFormSchema } from '#/adapter/form';

import { useI18n } from '@vben/locales';

import {
  useClaimOptions,
  useDefectOptions,
  useSeverityOptions,
  useStatusOptions,
} from '../constants';

export function getIssueFormSchema(): VbenFormSchema[] {
  const { t } = useI18n();
  const { defectOptions, defectSubtypes } = useDefectOptions();
  const { statusOptions } = useStatusOptions();
  const { severityOptions } = useSeverityOptions();
  const { claimOptions } = useClaimOptions();

  const schema: VbenFormSchema[] = [
    // Hidden ID field for edit mode - completely invisible
    {
      fieldName: 'id',
      label: '',
      component: 'Input',
      hideLabel: true,
      formItemClass: 'hidden', // Tailwind class to hide completely
    },
    {
      fieldName: 'inspectionId',
      label: '',
      component: 'Input',
      hideLabel: true,
      formItemClass: 'hidden',
    },
    {
      fieldName: 'ncNumber',
      label: t('qms.inspection.issues.ncNumber'),
      component: 'Input',
      componentProps: {
        placeholder: t('qms.inspection.issues.generateNumberPlaceholder'),
        readonly: true,
        disabled: true,
      },
    },
    {
      fieldName: 'reportDate',
      label: t('qms.inspection.issues.reportDate'),
      component: 'DatePicker',
      rules: 'required',
      componentProps: {
        valueFormat: 'YYYY-MM-DD',
        style: { width: '100%' },
      },
    },
    {
      fieldName: 'workOrderNumber',
      label: t('qms.workOrder.workOrderNumber'),
      component: 'Input',
      rules: 'selectRequired',
    },
    {
      fieldName: 'projectName',
      label: t('qms.workOrder.projectName'),
      component: 'Input',
      componentProps: {
        readonly: true,
        disabled: true,
      },
    },
    {
      fieldName: 'partName',
      label: t('qms.inspection.issues.partName'),
      component: 'Input',
      rules: 'required',
      componentProps: {
        placeholder: t('qms.inspection.issues.inputPartName'),
      },
    },
    {
      fieldName: 'processName',
      label: t('qms.inspection.issues.processName'),
      component: 'Select',
      rules: 'selectRequired',
      componentProps: {
        options: [
          { label: '外购件', value: '外购件' },
          { label: '原材料', value: '原材料' },
          { label: '辅材', value: '辅材' },
          { label: '机加成品件', value: '机加成品件' },
          { label: '设计', value: '设计' },
          { label: '下料', value: '下料' },
          { label: '组对', value: '组对' },
          { label: '焊接', value: '焊接' },
          { label: '机加', value: '机加' },
          { label: '涂装', value: '涂装' },
          { label: '组装', value: '组装' },
          { label: '成品检验', value: '成品检验' },
        ],
        allowClear: true,
        showSearch: true,
      },
    },
    {
      fieldName: 'quantity',
      label: t('qms.workOrder.quantity'),
      component: 'InputNumber',
      rules: 'required',
      componentProps: {
        min: 1,
        style: { width: '100%' },
      },
    },
    {
      fieldName: 'division',
      label: t('qms.workOrder.division'),
      component: 'Input',
      componentProps: {
        readonly: true,
        disabled: true,
      },
    },
    {
      fieldName: 'inspector',
      label: t('qms.inspection.issues.reportedBy'),
      component: 'Input',
    },
    {
      fieldName: 'responsibleDepartment',
      label: t('qms.inspection.issues.responsibleDepartment'),
      component: 'TreeSelect',
      rules: 'selectRequired',
      componentProps: {
        dropdownStyle: { maxHeight: '400px', overflow: 'auto' },
        treeDefaultExpandAll: true,
      },
    },
    {
      fieldName: 'responsibleWelder',
      label: t('qms.inspection.issues.responsibleWelder'),
      component: 'Select',
      rules: 'selectRequired',
      componentProps: {
        allowClear: true,
        showSearch: true,
        placeholder: '请选择责任焊工',
      },
      dependencies: {
        triggerFields: ['processName'],
        show: (values: Record<string, unknown>) =>
          String(values.processName || '').trim() === '焊接',
      },
    },
    {
      fieldName: 'supplierName',
      label: t('qms.inspection.issues.responsibleUnit'),
      component: 'Input',
      rules: 'required',
      dependencies: {
        triggerFields: ['responsibleDepartment'],
        show: (values: Record<string, unknown>) =>
          !!values.responsibleDepartment,
      },
    },
    {
      fieldName: 'status',
      label: t('qms.inspection.issues.statusLabel'),
      component: 'Select',
      rules: 'selectRequired',
      componentProps: {
        options: statusOptions.value,
      },
    },
    {
      fieldName: 'severity',
      label: t('qms.inspection.issues.severity'),
      component: 'Select',
      rules: 'selectRequired',
      componentProps: {
        options: severityOptions.value,
      },
    },
    {
      fieldName: 'defectType',
      label: t('qms.inspection.issues.defectType'),
      component: 'Select',
      rules: 'selectRequired',
      componentProps: {
        options: defectOptions.value,
      },
    },
    {
      fieldName: 'defectSubtype',
      label: t('qms.inspection.issues.defectSubtype'),
      component: 'Select',
      rules: 'selectRequired',
      dependencies: {
        triggerFields: ['defectType'],
        componentProps: (values: Record<string, unknown>) => {
          const type = values.defectType;
          return {
            options: type ? defectSubtypes.value[type as string] || [] : [],
          };
        },
      },
    },
    {
      fieldName: 'lossAmount',
      label: t('qms.inspection.issues.lossAmount'),
      component: 'InputNumber',
      componentProps: {
        min: 0,
        step: 0.01,
        style: { width: '100%' },
      },
    },
    {
      fieldName: 'claim',
      label: t('qms.inspection.issues.claim'),
      component: 'Select',
      componentProps: {
        options: claimOptions.value,
      },
    },
    {
      fieldName: 'description',
      label: t('qms.inspection.issues.description'),
      component: 'Textarea',
      rules: 'required',
      formItemClass: 'col-span-2',
      componentProps: {
        rows: 3,
        placeholder: t('qms.inspection.issues.descriptionPlaceholder'),
      },
    },
    {
      fieldName: 'rootCause',
      label: t('qms.inspection.issues.rootCause'),
      component: 'Textarea',
      rules: 'required',
      formItemClass: 'col-span-2',
      componentProps: {
        rows: 2,
      },
    },
    {
      fieldName: 'solution',
      label: t('qms.inspection.issues.solution'),
      component: 'Textarea',
      rules: 'required',
      formItemClass: 'col-span-2',
      componentProps: {
        rows: 2,
      },
    },
    {
      fieldName: 'photos',
      label: '',
      component: 'Input',
      formItemClass: 'col-span-2',
    },
  ];

  return schema;
}
