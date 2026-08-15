<script lang="ts" setup>
import type {
  InspectionIssueResponsibilityType,
  QualityClassificationCategory,
} from '@qgs/shared';

import type { StatusOption } from '../constants';

import { computed, onMounted, ref, watch } from 'vue';

import { useI18n } from '@vben/locales';

import {
  INSPECTION_ISSUE_RESPONSIBILITY_TYPE,
  QUALITY_CLASSIFICATION_SCOPES,
} from '@qgs/shared';
import { Button, Select, Tooltip } from 'ant-design-vue';

import { useVbenForm } from '#/adapter/form';
import { getWelderListPage } from '#/api/qms/welder';
import { useErrorHandler } from '#/hooks/useErrorHandler';

import SupplierSelect from '../../../shared/components/SupplierSelect.vue';
import WorkOrderSelect from '../../../shared/components/WorkOrderSelect.vue';
import { useQualityClassificationOptions } from '../../../shared/composables/useQualityClassificationOptions';
import { useAiAnalysis } from '../composables/useAiAnalysis';
import {
  getIssueFormSchemaWithStatusOptions,
  ISSUE_RESPONSIBILITY_TYPE_OPTIONS,
  isWeldingDefectSubcategory,
  isWeldingProcessName,
  RESPONSIBLE_DEPARTMENT_TREE_SELECT_PROPS,
} from './issueFormData';
import { isExternalInspectionIssueResponsibility } from './issueFormPayload';
import IssuePhotoUpload from './IssuePhotoUpload.vue';
import IssueSimilarCases from './IssueSimilarCases.vue';

type IssueFormMode = 'embedded' | 'standalone';

interface DeptTreeLikeNode {
  children?: DeptTreeLikeNode[];
  label?: string;
  title?: string;
  value: number | string;
}

interface Props {
  deptTreeData: DeptTreeLikeNode[];
  mode?: IssueFormMode;
  isEditMode?: boolean;
  hideResponsibilityDepartment?: boolean;
  processOptions?: Array<{ label: string; value: string }>;
  responsibilityType?: InspectionIssueResponsibilityType;
  responsibilityTypeOptions?: Array<{
    label: string;
    value: InspectionIssueResponsibilityType;
  }>;
  statusOptions?: StatusOption[];
}

defineOptions({ name: 'IssueFormFields' });

const props = withDefaults(defineProps<Props>(), {
  mode: 'standalone',
  isEditMode: false,
  hideResponsibilityDepartment: false,
  processOptions: () => [],
  responsibilityType: undefined,
  responsibilityTypeOptions: () => [...ISSUE_RESPONSIBILITY_TYPE_OPTIONS],
  statusOptions: () => [],
});

const emit = defineEmits<{
  searchWorkOrder: [string];
  valuesChange: [Record<string, unknown>];
}>();

const isEmbedded = computed(() => props.mode === 'embedded');
const { t } = useI18n();
const { handleApiError } = useErrorHandler();

type IssueFormValues = Partial<{
  defectCategoryId: string;
  defectSubcategoryId: string;
  description: string;
  division: string;
  generateNcNumber: boolean;
  inspector: string;
  ncNumber: string;
  partName: string;
  processName: string;
  projectName: string;
  reportDate: string;
  responsibilityType: InspectionIssueResponsibilityType;
  responsibleDepartmentId: string;
  responsibleWelder: string;
  responsibleWelderId: string;
  rootCause: string;
  solution: string;
  supplierId: string;
  supplierName: string;
  workOrderNumber: string;
}>;
const formValues = ref<IssueFormValues>({});
type WelderOption = {
  label: string;
  name: string;
  searchText: string;
  value: string;
};
const welderOptions = ref<WelderOption[]>([]);
const welderLoading = ref(false);
const {
  loadOptions: loadClassificationOptions,
  options: classificationOptions,
} = useQualityClassificationOptions(QUALITY_CLASSIFICATION_SCOPES[0]);

function mapCategoryOptions(items: QualityClassificationCategory[]) {
  return items.map((item) => ({ label: item.name, value: item.id }));
}

function mapSubcategoryOptions(categoryId?: string) {
  return (
    classificationOptions.value
      .find((item) => item.id === categoryId)
      ?.subcategories.map((item) => ({
        label: item.name,
        value: item.id,
      })) || []
  );
}

function isHeaderLikeWelderRecord(params: { code?: string; name?: string }) {
  const name = String(params.name || '')
    .trim()
    .toLowerCase();
  const code = String(params.code || '')
    .trim()
    .toLowerCase();
  const combined = `${name} ${code}`;
  return (
    combined.includes('焊工编号') ||
    combined.includes('焊工姓名') ||
    combined.includes('姓名') ||
    combined.includes('最新') ||
    combined.includes('(姓名)') ||
    combined.includes('（姓名）') ||
    combined.includes('weldercode') ||
    combined.includes('weldername')
  );
}

function isTestWelderRecord(params: { code?: string; name?: string }) {
  const name = String(params.name || '')
    .trim()
    .toLowerCase();
  const code = String(params.code || '')
    .trim()
    .toLowerCase();
  return (
    name.includes('测试') ||
    name.includes('test') ||
    code.includes('test') ||
    code.startsWith('t-test')
  );
}

function buildFormSchema() {
  const isResponsibilityLocked = !!props.responsibilityType;
  return getIssueFormSchemaWithStatusOptions(
    props.statusOptions,
    props.processOptions,
    [],
    props.isEditMode,
    props.responsibilityTypeOptions,
  ).map((field) => {
    const isResponsibilityField = [
      'responsibilityType',
      'responsibleDepartmentId',
      'supplierId',
    ].includes(field.fieldName);
    if (!isResponsibilityField) return field;

    return {
      ...field,
      ...(field.fieldName === 'responsibleDepartmentId' &&
      props.hideResponsibilityDepartment
        ? {
            dependencies: {
              triggerFields: ['responsibilityType'],
              show: () => false,
            },
            rules: undefined,
          }
        : {}),
      componentProps: {
        ...field.componentProps,
        ...(field.fieldName === 'responsibleDepartmentId'
          ? {
              ...RESPONSIBLE_DEPARTMENT_TREE_SELECT_PROPS,
              treeData: props.deptTreeData,
            }
          : {}),
        disabled: isResponsibilityLocked,
      },
    };
  });
}

const [Form, formApi] = useVbenForm({
  commonConfig: {
    labelWidth: 100,
    componentProps: { class: 'w-full' },
  },
  layout: 'vertical',
  wrapperClass:
    'issue-edit-form-grid grid min-w-0 grid-cols-1 gap-x-4 gap-y-0 sm:grid-cols-2',
  handleSubmit: async () => {},
  handleValuesChange: (vals) => {
    formValues.value = vals as IssueFormValues;
    emit('valuesChange', vals as Record<string, unknown>);
  },
  schema: buildFormSchema(),
  showDefaultActions: false,
});

const resolvedResponsibilityType = computed(() => {
  if (props.responsibilityType) return props.responsibilityType;
  return (
    formValues.value.responsibilityType ||
    INSPECTION_ISSUE_RESPONSIBILITY_TYPE.INTERNAL_DEPARTMENT
  );
});

function isAllowedResponsibilityType(
  value: InspectionIssueResponsibilityType | undefined,
) {
  return props.responsibilityTypeOptions.some(
    (option) => option.value === value,
  );
}

const targetUnitCategory = computed(() => {
  return resolvedResponsibilityType.value ===
    INSPECTION_ISSUE_RESPONSIBILITY_TYPE.OUTSOURCING_UNIT
    ? 'Outsourcing'
    : 'Supplier';
});

const shouldShowSupplier = computed(() => {
  return isExternalInspectionIssueResponsibility(
    resolvedResponsibilityType.value,
  );
});

function syncDepartmentTreeSchema(data: DeptTreeLikeNode[]) {
  formApi.updateSchema([
    {
      fieldName: 'responsibleDepartmentId',
      componentProps: {
        ...RESPONSIBLE_DEPARTMENT_TREE_SELECT_PROPS,
        treeData: data,
      },
    },
  ]);
}

watch(() => props.deptTreeData, syncDepartmentTreeSchema, {
  immediate: true,
});

watch(
  shouldShowSupplier,
  (show) => {
    formApi.updateSchema([
      {
        fieldName: 'supplierId',
        dependencies: {
          triggerFields: ['responsibilityType'],
          show: () => show,
        },
      },
    ]);
  },
  { immediate: true },
);

watch(
  () => props.responsibilityType,
  (responsibilityType) => {
    const isResponsibilityLocked = !!responsibilityType;
    formApi.updateSchema([
      {
        fieldName: 'responsibilityType',
        componentProps: { disabled: isResponsibilityLocked },
      },
      {
        fieldName: 'responsibleDepartmentId',
        componentProps: { disabled: isResponsibilityLocked },
      },
      {
        fieldName: 'supplierId',
        componentProps: { disabled: isResponsibilityLocked },
      },
    ]);
    if (responsibilityType) {
      formApi.setFieldValue('responsibilityType', responsibilityType);
    }
  },
  { immediate: true },
);

watch(
  () => props.hideResponsibilityDepartment,
  (hideResponsibilityDepartment) => {
    formApi.setState({ schema: buildFormSchema() });
    if (hideResponsibilityDepartment) {
      formApi.setFieldValue('responsibleDepartmentId', undefined);
    }
  },
  { immediate: true },
);

watch(
  () => props.responsibilityTypeOptions,
  (options) => {
    formApi.updateSchema([
      {
        fieldName: 'responsibilityType',
        componentProps: { allowClear: false, options },
      },
    ]);
    if (
      !props.responsibilityType &&
      !isAllowedResponsibilityType(formValues.value.responsibilityType)
    ) {
      formApi.setFieldValue(
        'responsibilityType',
        INSPECTION_ISSUE_RESPONSIBILITY_TYPE.INTERNAL_DEPARTMENT,
      );
      formApi.setFieldValue('supplierId', undefined);
      formApi.setFieldValue('supplierName', '');
    }
  },
  { immediate: true },
);

watch(
  shouldShowSupplier,
  (show) => {
    if (!show) {
      formApi.setFieldValue('supplierId', undefined);
      formApi.setFieldValue('supplierName', '');
    }
  },
  { immediate: true },
);

watch(
  () => props.statusOptions,
  (options) => {
    if (!options) return;
    formApi.updateSchema([
      {
        fieldName: 'status',
        componentProps: { options },
      },
    ]);
  },
  { immediate: true },
);

watch(
  () => props.processOptions,
  (options) => {
    if (!options) return;
    formApi.updateSchema([
      {
        fieldName: 'processName',
        componentProps: {
          options,
          allowClear: true,
          showSearch: true,
        },
      },
    ]);
  },
  { immediate: true },
);

watch(
  () => props.isEditMode,
  () => {
    formApi.setState({
      schema: buildFormSchema(),
    });
  },
  { immediate: true },
);

watch(
  () => formValues.value.defectCategoryId,
  (categoryId, previousCategoryId) => {
    const subcategoryId = formValues.value.defectSubcategoryId;
    if (
      categoryId === previousCategoryId ||
      !subcategoryId ||
      mapSubcategoryOptions(categoryId).some(
        (item) => item.value === subcategoryId,
      )
    ) {
      return;
    }
    formApi.setFieldValue('defectSubcategoryId', undefined);
  },
);

const EMBEDDED_LOCKED_FIELDS = [
  'workOrderNumber',
  'projectName',
  'partName',
  'processName',
  'division',
  'inspector',
  'reportDate',
  'inspectionId',
  'quantity',
  'ncNumber',
];

watch(
  () => props.mode,
  (mode) => {
    if (mode !== 'embedded') return;
    formApi.updateSchema(
      EMBEDDED_LOCKED_FIELDS.map((fieldName) => ({
        fieldName,
        componentProps: { disabled: true, readonly: true },
      })),
    );
  },
  { immediate: true },
);

const {
  isAiAnalyzing,
  isMatchingCases,
  matchedCases,
  analyzeIssue,
  matchHistory,
  applyCaseSolution,
  clearMatchedCases,
} = useAiAnalysis({ formState: formValues });

onMounted(async () => {
  try {
    await loadClassificationOptions();
    formApi.updateSchema([
      {
        fieldName: 'defectCategoryId',
        componentProps: {
          allowClear: true,
          options: mapCategoryOptions(classificationOptions.value),
          showSearch: true,
        },
      },
      {
        fieldName: 'defectSubcategoryId',
        dependencies: {
          triggerFields: ['defectCategoryId'],
          componentProps: (values: Record<string, unknown>) => ({
            allowClear: true,
            options: mapSubcategoryOptions(
              String(values.defectCategoryId || ''),
            ),
            showSearch: true,
          }),
        },
      },
      {
        fieldName: 'responsibleWelder',
        dependencies: {
          triggerFields: [
            'processName',
            'defectCategoryId',
            'defectSubcategoryId',
          ],
          show: (values: Record<string, unknown>) =>
            isWeldingProcessName(values.processName) ||
            isWeldingDefectSubcategory(
              values.defectSubcategoryId,
              classificationOptions.value,
            ),
        },
      },
    ]);
  } catch (error) {
    handleApiError(error, 'Load Inspection Issue Classifications');
  }
  try {
    welderLoading.value = true;
    const result = await getWelderListPage({
      employmentStatus: 'ON_DUTY',
      page: 1,
      pageSize: 500,
    });
    welderOptions.value = (result.items || [])
      .map((item) => {
        const name = String(item.name || '').trim();
        if (!name) return null;
        const code = String(item.welderCode || '').trim();
        if (
          isHeaderLikeWelderRecord({ code, name }) ||
          isTestWelderRecord({ code, name })
        ) {
          return null;
        }
        return {
          label: code ? `${name}（${code}）` : name,
          name,
          searchText: `${name} ${code}`.trim().toLowerCase(),
          value: item.id,
        };
      })
      .filter(Boolean) as WelderOption[];
  } finally {
    welderLoading.value = false;
  }
});

function handleResponsibleWelderChange(value: unknown) {
  const welderId = String(value || '').trim();
  const option = welderOptions.value.find((item) => item.value === welderId);
  formApi.setValues({
    responsibleWelder: option?.name || '',
    responsibleWelderId: welderId || '',
  });
}

// Edit backfill: the persisted value is a legacy name snapshot, so map it to
// the canonical option when a unique match exists; unknown names stay as
// text and are resolved (or audited) server-side.
watch(
  () => formValues.value.responsibleWelder,
  (value) => {
    const current = String(value || '').trim();
    if (!current || welderOptions.value.length === 0) return;
    if (welderOptions.value.some((item) => item.value === current)) return;
    const byName = welderOptions.value.find((item) => item.name === current);
    if (byName) {
      formApi.setFieldValue('responsibleWelder', byName.value);
      formApi.setFieldValue('responsibleWelderId', byName.value);
    }
  },
);

function handleWorkOrderChange(
  val: unknown,
  option?: {
    item?: {
      division?: string;
      projectName?: string;
      workOrderNumber?: string;
    };
  },
) {
  const wo = option?.item;
  if (wo) {
    formApi.setValues({
      projectName: wo.projectName || '',
      division: wo.division || '',
    });
    emit('searchWorkOrder', wo.workOrderNumber || '');
  } else {
    emit('searchWorkOrder', String(val));
  }
}

function handleSupplierChange(
  supplierId: string | undefined,
  option?: { item?: { id: string; name: string } },
) {
  formApi.setFieldValue('supplierId', supplierId);
  formApi.setFieldValue('supplierName', option?.item?.name || '');
}

defineExpose({
  validate: () => formApi.validate(),
  getValues: () => formApi.getValues(),
  setValues: (values: Record<string, unknown>) => formApi.setValues(values),
  resetForm: () => formApi.resetForm(),
  setFieldValue: (field: string, value: unknown) =>
    formApi.setFieldValue(field, value),
  clearMatchedCases,
});
</script>

<template>
  <div class="issue-form-fields min-w-0">
    <Form>
      <template #ncNumber="{ modelValue }">
        <span
          class="ant-input ant-input-disabled inline-block w-full rounded border bg-gray-50 px-2 py-1"
        >
          {{ modelValue || 'Unnumbered' }}
        </span>
      </template>

      <template #workOrderNumber="slotProps">
        <WorkOrderSelect v-bind="slotProps" @change="handleWorkOrderChange" />
      </template>

      <template #supplierId="slotProps">
        <SupplierSelect
          v-bind="slotProps"
          :key="targetUnitCategory"
          :category="targetUnitCategory"
          :legacy-name="formValues.supplierName"
          value-mode="id"
          @change="handleSupplierChange"
        />
      </template>

      <template #responsibleWelder="slotProps">
        <Select
          v-bind="slotProps"
          :loading="welderLoading"
          :options="welderOptions"
          allow-clear
          show-search
          @change="handleResponsibleWelderChange"
          :filter-option="
            (input, option) =>
              String(option?.searchText || '')
                .toLowerCase()
                .includes(
                  String(input || '')
                    .trim()
                    .toLowerCase(),
                ) ||
              String(option?.label || '')
                .toLowerCase()
                .includes(
                  String(input || '')
                    .trim()
                    .toLowerCase(),
                ) ||
              String(option?.value || '')
                .toLowerCase()
                .includes(
                  String(input || '')
                    .trim()
                    .toLowerCase(),
                )
          "
          placeholder="请选择责任焊工"
        />
      </template>

      <template #description-label>
        <div
          class="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
        >
          <span>{{ t('qms.inspection.issues.description') }}</span>
          <div v-if="!isEmbedded" class="flex flex-wrap gap-2">
            <Tooltip :title="t('qms.inspection.issues.aiAnalyzeTooltip')">
              <Button
                :loading="isAiAnalyzing"
                size="small"
                type="link"
                @click="analyzeIssue"
              >
                <span class="i-lucide-sparkles mr-1"></span>
                {{ t('qms.inspection.issues.aiAnalyze') }}
              </Button>
            </Tooltip>
            <Tooltip :title="t('qms.inspection.issues.matchHistoryTooltip')">
              <Button
                :loading="isMatchingCases"
                size="small"
                type="link"
                @click="matchHistory"
              >
                <span class="i-lucide-history mr-1"></span>
                {{ t('qms.inspection.issues.matchCases') }}
              </Button>
            </Tooltip>
          </div>
        </div>
      </template>

      <template #photos="slotProps">
        <IssuePhotoUpload v-bind="slotProps" />
      </template>
    </Form>

    <IssueSimilarCases
      v-if="!isEmbedded && matchedCases.length > 0"
      :cases="matchedCases"
      @apply="(solution) => applyCaseSolution(solution)"
    />
  </div>
</template>

<style scoped>
:deep(.ant-form-item) {
  min-width: 0;
  margin-bottom: 16px;
}

:deep(.issue-edit-form-grid > *) {
  min-width: 0;
}

:deep(.ant-form-item-label),
:deep(.ant-form-item-control) {
  min-width: 0;
}

:deep(.ant-form-item-control-input-content),
:deep(.ant-select),
:deep(.ant-select-selector),
:deep(.ant-input),
:deep(.ant-picker),
:deep(.ant-input-number),
:deep(.ant-tree-select),
:deep(.ant-upload-list),
:deep(.ant-upload-list-item),
:deep(.ant-upload-wrapper) {
  min-width: 0;
  max-width: 100%;
}

:deep(.ant-select-selection-overflow) {
  max-width: 100%;
  overflow: hidden;
}

:deep(textarea.ant-input) {
  resize: vertical;
}

@media (max-width: 767px) {
  :deep(.ant-form-item) {
    align-items: stretch;
  }

  :deep(.issue-edit-form-grid > *) {
    grid-column: 1 / -1;
  }

  :deep(.ant-form-item-control),
  :deep(.ant-form-item-control-input),
  :deep(.ant-form-item-control-input-content) {
    width: 100%;
  }
}
</style>
