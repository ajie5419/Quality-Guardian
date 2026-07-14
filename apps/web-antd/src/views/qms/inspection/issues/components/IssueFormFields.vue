<script lang="ts" setup>
import type { StatusOption } from '../constants';

import { computed, onMounted, ref, watch } from 'vue';

import { useI18n } from '@vben/locales';

import { Button, message, Select, Switch, Tooltip } from 'ant-design-vue';

import { useVbenForm } from '#/adapter/form';
import { generateInspectionNcNumber } from '#/api/qms/inspection';
import { getWelderListPage } from '#/api/qms/welder';
import { useErrorHandler } from '#/hooks/useErrorHandler';

import SupplierSelect from '../../../shared/components/SupplierSelect.vue';
import WorkOrderSelect from '../../../shared/components/WorkOrderSelect.vue';
import { useAiAnalysis } from '../composables/useAiAnalysis';
import { DEPT_TYPE_KEYWORDS } from '../constants';
import { getIssueFormSchemaWithStatusOptions } from './issueFormData';
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
  processOptions?: Array<{ label: string; value: string }>;
  statusOptions?: StatusOption[];
}

defineOptions({ name: 'IssueFormFields' });

const props = withDefaults(defineProps<Props>(), {
  mode: 'standalone',
  isEditMode: false,
  processOptions: () => [],
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
  defectType: string;
  description: string;
  division: string;
  inspector: string;
  ncNumber: string;
  partName: string;
  processName: string;
  projectName: string;
  reportDate: string;
  responsibleDepartment: string;
  responsibleDepartments: string[];
  responsibleWelder: string;
  rootCause: string;
  solution: string;
  supplierId: string;
  supplierName: string;
  workOrderNumber: string;
}>;
const formValues = ref<IssueFormValues>({});
type WelderOption = { label: string; searchText: string; value: string };
const welderOptions = ref<WelderOption[]>([]);
const welderLoading = ref(false);

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
  schema: getIssueFormSchemaWithStatusOptions(
    props.statusOptions,
    props.processOptions,
  ),
  showDefaultActions: false,
});

function firstResponsibleDepartment(): string {
  const departments = formValues.value.responsibleDepartments;
  if (Array.isArray(departments) && departments.length > 0) {
    return departments[0] || '';
  }
  return formValues.value.responsibleDepartment || '';
}

function findDeptTitle(
  tree: DeptTreeLikeNode[],
  value?: string,
): string | undefined {
  if (!value) return undefined;
  for (const node of tree) {
    if (String(node.value) === value) return node.label || node.title;
    if (node.children) {
      const found = findDeptTitle(node.children, value);
      if (found) return found;
    }
  }
  return undefined;
}

const targetUnitCategory = computed(() => {
  const deptId = firstResponsibleDepartment();
  const name = findDeptTitle(props.deptTreeData, deptId) || '';
  if (name.includes(DEPT_TYPE_KEYWORDS.PURCHASE)) return 'Supplier';
  if (
    name.includes(DEPT_TYPE_KEYWORDS.PRODUCTION) ||
    name.includes('生产') ||
    name.includes(DEPT_TYPE_KEYWORDS.OUTSOURCED)
  )
    return 'Outsourcing';
  return 'Supplier';
});

const shouldShowSupplier = computed(() => {
  const deptId = firstResponsibleDepartment();
  if (!deptId) return false;
  const name = findDeptTitle(props.deptTreeData, deptId) || '';
  return (
    name.includes(DEPT_TYPE_KEYWORDS.PURCHASE) ||
    name.includes(DEPT_TYPE_KEYWORDS.PRODUCTION) ||
    name.includes(DEPT_TYPE_KEYWORDS.OUTSOURCED) ||
    name.includes('生产')
  );
});

const isAutoNc = ref(false);
const isGeneratingNc = ref(false);

async function autoFillNcNumber() {
  if (props.isEditMode || isGeneratingNc.value) return;
  try {
    isGeneratingNc.value = true;
    const { ncNumber } = await generateInspectionNcNumber();
    if (!ncNumber) {
      message.warning('NC 编号生成接口未返回编号');
      return;
    }
    formApi.setFieldValue('ncNumber', ncNumber);
  } catch (error) {
    handleApiError(error, 'Generate NC Number');
  } finally {
    isGeneratingNc.value = false;
  }
}

watch(isAutoNc, async (val) => {
  if (props.isEditMode) return;
  if (val) {
    await autoFillNcNumber();
  } else {
    formApi.setFieldValue('ncNumber', '');
  }
});

watch(
  () => props.deptTreeData,
  (data) => {
    formApi.updateSchema([
      {
        fieldName: 'responsibleDepartments',
        componentProps: { treeData: data },
      },
    ]);
  },
  { immediate: true },
);

watch(
  shouldShowSupplier,
  (show) => {
    formApi.updateSchema([
      {
        fieldName: 'supplierId',
        dependencies: {
          triggerFields: ['responsibleDepartments'],
          show: () => show,
        },
      },
    ]);
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
          searchText: `${name} ${code}`.trim().toLowerCase(),
          value: code || name,
        };
      })
      .filter(Boolean) as WelderOption[];
  } finally {
    welderLoading.value = false;
  }
});

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
  isAutoNc,
  resetAutoNc: () => {
    isAutoNc.value = false;
  },
  clearMatchedCases,
});
</script>

<template>
  <div class="issue-form-fields min-w-0">
    <Form>
      <template #ncNumber="{ modelValue }">
        <div class="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
          <div class="relative min-w-0 flex-1">
            <span
              class="ant-input ant-input-disabled inline-block w-full rounded border bg-gray-50 px-2 py-1"
            >
              {{
                modelValue ||
                t('qms.inspection.issues.generateNumberPlaceholder')
              }}
            </span>
          </div>
          <div
            v-if="!isEditMode"
            class="flex flex-shrink-0 flex-wrap items-center gap-2"
          >
            <Button
              :loading="isGeneratingNc"
              size="small"
              type="primary"
              @click="autoFillNcNumber"
            >
              {{ t('qms.inspection.issues.generateNumber') }}
            </Button>
            <span class="text-xs text-gray-400">自动生成</span>
            <Switch v-model:checked="isAutoNc" size="small" />
          </div>
        </div>
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
