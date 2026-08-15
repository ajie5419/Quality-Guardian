import type {
  InspectionIssueResponsibilityType,
  QualityClassificationCategory,
} from '@qgs/shared';

import type { StatusOption } from '../constants';

import type { VbenFormSchema } from '#/adapter/form';

import { useI18n } from '@vben/locales';

import {
  INSPECTION_ISSUE_RESPONSIBILITY_TYPE,
  WELDING_DEFECT_CODE,
  WELDING_PROCESS_KEYWORD,
} from '@qgs/shared';

import { mapDictionaryOptionsToInspectionProcess } from '../../records/config';
import {
  useClaimOptions,
  useSeverityOptions,
  useStatusOptions,
} from '../constants';
import { isExternalInspectionIssueResponsibility } from './issueFormPayload';

/**
 * Department options use Ant Design Vue's native { title, value, children }
 * shape. This keeps asynchronous ID values renderable without converting the
 * form value into a labelled object.
 */
export const RESPONSIBLE_DEPARTMENT_TREE_SELECT_PROPS = {
  labelInValue: false,
  treeDefaultExpandAll: true,
  treeNodeFilterProp: 'title',
  treeNodeLabelProp: 'title',
} as const;

export const ISSUE_RESPONSIBILITY_TYPE_OPTIONS: ReadonlyArray<{
  label: string;
  value: InspectionIssueResponsibilityType;
}> = [
  {
    label: '内部部门',
    value: INSPECTION_ISSUE_RESPONSIBILITY_TYPE.INTERNAL_DEPARTMENT,
  },
  {
    label: '供应商',
    value: INSPECTION_ISSUE_RESPONSIBILITY_TYPE.SUPPLIER,
  },
  {
    label: '外协单位',
    value: INSPECTION_ISSUE_RESPONSIBILITY_TYPE.OUTSOURCING_UNIT,
  },
];

export function isWeldingProcessName(value: unknown) {
  return String(value ?? '')
    .trim()
    .includes(WELDING_PROCESS_KEYWORD);
}

export function isWeldingDefectSubcategory(
  subcategoryId: unknown,
  classificationOptions: QualityClassificationCategory[],
) {
  const id = String(subcategoryId ?? '').trim();
  if (!id) return false;
  return classificationOptions
    .flatMap((category) => category.subcategories)
    .some(
      (subcategory) =>
        subcategory.id === id &&
        (subcategory.code === WELDING_DEFECT_CODE ||
          String(subcategory.name ?? '').includes(WELDING_PROCESS_KEYWORD)),
    );
}

export function getIssueFormSchema(
  processOptionsOverride?: Array<{ label: string; value: string }>,
  classificationOptions: QualityClassificationCategory[] = [],
  isEditMode = false,
  responsibilityTypeOptions = ISSUE_RESPONSIBILITY_TYPE_OPTIONS,
): VbenFormSchema[] {
  const { t } = useI18n();
  const { statusOptions: fallbackStatusOptions } = useStatusOptions();
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
    ...(isEditMode
      ? [
          {
            fieldName: 'ncNumber',
            label: t('qms.inspection.issues.ncNumber'),
            component: 'Input' as const,
            componentProps: { readonly: true, disabled: true },
          },
        ]
      : [
          {
            fieldName: 'generateNcNumber',
            label: '生成不合格编号',
            component: 'Switch' as const,
            componentProps: {
              // The form defaults every control to w-full. A switch must keep
              // its intrinsic width instead of becoming a full-row toggle.
              class: '!w-auto',
              style: { width: 'auto' },
            },
          },
        ]),
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
        options:
          processOptionsOverride || mapDictionaryOptionsToInspectionProcess([]),
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
      fieldName: 'responsibilityType',
      label: '责任归属类型',
      component: 'Select',
      rules: 'selectRequired',
      componentProps: {
        allowClear: false,
        options: responsibilityTypeOptions,
      },
    },
    {
      fieldName: 'responsibleDepartmentId',
      label: t('qms.inspection.issues.responsibleDepartment'),
      component: 'TreeSelect',
      rules: 'selectRequired',
      componentProps: {
        dropdownStyle: { maxHeight: '400px', overflow: 'auto' },
        ...RESPONSIBLE_DEPARTMENT_TREE_SELECT_PROPS,
      },
    },
    {
      fieldName: 'responsibleWelder',
      label: t('qms.inspection.issues.responsibleWelder'),
      component: 'Input',
      componentProps: { hidden: true },
      dependencies: {
        triggerFields: ['processName'],
        show: (values: Record<string, unknown>) =>
          isWeldingProcessName(values.processName),
      },
    },
    {
      fieldName: 'responsibleWelderId',
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
          isWeldingProcessName(values.processName),
      },
    },
    {
      fieldName: 'supplierName',
      label: '',
      component: 'Input',
      hideLabel: true,
      formItemClass: 'hidden',
    },
    {
      fieldName: 'supplierId',
      label: t('qms.inspection.issues.responsibleUnit'),
      component: 'Input',
      rules: 'required',
      dependencies: {
        triggerFields: ['responsibilityType'],
        show: (values: Record<string, unknown>) =>
          isExternalInspectionIssueResponsibility(values.responsibilityType),
      },
    },
    {
      fieldName: 'status',
      label: t('qms.inspection.issues.statusLabel'),
      component: 'Select',
      rules: 'selectRequired',
      componentProps: {
        options: fallbackStatusOptions.value,
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
      fieldName: 'defectCategoryId',
      label: t('qms.inspection.issues.defectType'),
      component: 'Select',
      rules: 'selectRequired',
      componentProps: {
        options: classificationOptions.map((item) => ({
          label: item.name,
          value: item.id,
        })),
        allowClear: true,
        showSearch: true,
      },
    },
    {
      fieldName: 'defectSubcategoryId',
      label: t('qms.inspection.issues.defectSubtype'),
      component: 'Select',
      rules: 'selectRequired',
      dependencies: {
        triggerFields: ['defectCategoryId'],
        componentProps: (values: Record<string, unknown>) => {
          const categoryId = String(values.defectCategoryId || '');
          const category = classificationOptions.find(
            (item) => item.id === categoryId,
          );
          return {
            options: (category?.subcategories || []).map((item) => ({
              label: item.name,
              value: item.id,
            })),
            allowClear: true,
            showSearch: true,
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

export function getIssueFormSchemaWithStatusOptions(
  options?: StatusOption[],
  processOptions?: Array<{ label: string; value: string }>,
  classificationOptions: QualityClassificationCategory[] = [],
  isEditMode = false,
  responsibilityTypeOptions = ISSUE_RESPONSIBILITY_TYPE_OPTIONS,
): VbenFormSchema[] {
  const schema = getIssueFormSchema(
    processOptions,
    classificationOptions,
    isEditMode,
    responsibilityTypeOptions,
  );
  const target = schema.find((item) => item.fieldName === 'status');
  if (target) {
    target.componentProps = {
      ...target.componentProps,
      options: options || [],
    };
  }
  return schema;
}
