<script lang="ts" setup>
import type { DeptNode, InspectionIssue } from '../types';

import { computed, onMounted, ref, toRef, watch } from 'vue';

import { useI18n } from '@vben/locales';

import { Button, Modal, Select, Switch, Tooltip } from 'ant-design-vue';

import { useVbenForm } from '#/adapter/form';
import { getWelderListPage } from '#/api/qms/welder';

import SupplierSelect from '../../../shared/components/SupplierSelect.vue';
import WorkOrderSelect from '../../../shared/components/WorkOrderSelect.vue';
import { useAiAnalysis } from '../composables/useAiAnalysis';
import { useIssueForm } from '../composables/useIssueForm';
import { useNcNumber } from '../composables/useNcNumber';
import { DEPT_TYPE_KEYWORDS } from '../constants';
import { getIssueFormSchema } from './issueFormData';
import IssuePhotoUpload from './IssuePhotoUpload.vue';
import IssueSimilarCases from './IssueSimilarCases.vue';

const props = defineProps<{
  deptTreeData: DeptNode[];
  initialData?: Partial<InspectionIssue>;
  isEditMode: boolean;
  open: boolean;
}>();

const emit = defineEmits<{
  searchWorkOrder: [string];
  success: [];
  'update:open': [boolean];
}>();

const { t } = useI18n();

// Local reactive state for form values to ensure reactivity in slots and composables
type IssueFormValues = {
  defectType?: string;
  description?: string;
  division?: string;
  partName?: string;
  projectName?: string;
  responsibleDepartment?: string;
  responsibleWelder?: string;
  rootCause?: string;
  solution?: string;
};
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
    // 统一布局配置
    labelWidth: 100,
    componentProps: {
      class: 'w-full',
    },
  },
  wrapperClass: 'grid grid-cols-2 gap-x-4 gap-y-0',
  handleSubmit: () => submit(),
  handleValuesChange: (vals) => {
    formValues.value = vals as IssueFormValues;
  },
  schema: getIssueFormSchema(),
  showDefaultActions: false, // Handle submit via Modal OK button
});

// Composable integration
const openRef = toRef(props, 'open');
const isEditModeRef = toRef(props, 'isEditMode');
const initialDataRef = computed(() => props.initialData);

const { submit } = useIssueForm({
  formApi,
  initialData: initialDataRef,
  isEditMode: isEditModeRef,
  open: openRef,
  onSuccess: () => emit('success'),
  onClose: () => emit('update:open', false),
});

// Composable integration using the synced formValues
const { isAutoNc, resetAutoNc } = useNcNumber({
  formApi,
  isEditMode: isEditModeRef,
});

const {
  isAiAnalyzing,
  isMatchingCases,
  matchedCases,
  analyzeIssue,
  matchHistory,
  applyCaseSolution,
  clearMatchedCases,
} = useAiAnalysis({ formState: formValues });

// Department finding logic
function findDeptTitle(tree: DeptNode[], value?: string): string | undefined {
  if (!value) return undefined;
  for (const node of tree) {
    const nodeTitle = node.label;
    if (node.value === value) return nodeTitle;
    if (node.children) {
      const found = findDeptTitle(node.children, value);
      if (found) return found;
    }
  }
  return undefined;
}

// Supplier category calculation
const targetUnitCategory = computed(() => {
  const deptId = formValues.value.responsibleDepartment as string;
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

// Determine if supplier field should be visible
const shouldShowSupplier = computed(() => {
  const deptId = formValues.value.responsibleDepartment as string;
  if (!deptId) return false;
  const name = findDeptTitle(props.deptTreeData, deptId) || '';
  return (
    name.includes(DEPT_TYPE_KEYWORDS.PURCHASE) ||
    name.includes(DEPT_TYPE_KEYWORDS.PRODUCTION) ||
    name.includes(DEPT_TYPE_KEYWORDS.OUTSOURCED) ||
    name.includes('生产')
  );
});

// Watchers for initialization
watch(
  () => props.deptTreeData,
  (data) => {
    formApi.updateSchema([
      {
        fieldName: 'responsibleDepartment',
        componentProps: { treeData: data },
      },
    ]);
  },
  { immediate: true },
);

// Watcher to update supplier field visibility based on department selection
watch(
  shouldShowSupplier,
  (show) => {
    formApi.updateSchema([
      {
        fieldName: 'supplierName',
        dependencies: {
          triggerFields: ['responsibleDepartment'],
          show: () => show,
        },
      },
    ]);
  },
  { immediate: true },
);

watch(openRef, (val) => {
  if (val && !props.isEditMode) {
    resetAutoNc();
    clearMatchedCases();
  }
});

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

// Event Handlers
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

async function handleOk() {
  await submit();
}

function handleCancel() {
  emit('update:open', false);
}
</script>

<template>
  <Modal
    :confirm-loading="false"
    :open="open"
    :title="
      isEditMode
        ? t('qms.inspection.issues.editIssue')
        : t('qms.inspection.issues.createIssue')
    "
    width="900px"
    @cancel="handleCancel"
    @ok="handleOk"
  >
    <div class="max-h-[700px] overflow-y-auto p-2">
      <Form>
        <!-- NC Number Slot: Add Auto Switch -->
        <template #ncNumber="{ modelValue }">
          <div class="flex items-center gap-2">
            <div class="relative flex-1">
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
              class="flex flex-shrink-0 items-center gap-2"
            >
              <span class="text-xs text-gray-400">自动生成</span>
              <Switch v-model:checked="isAutoNc" size="small" />
            </div>
          </div>
        </template>

        <!-- Work Order Slot -->
        <template #workOrderNumber="slotProps">
          <WorkOrderSelect v-bind="slotProps" @change="handleWorkOrderChange" />
        </template>

        <!-- Supplier Slot -->
        <template #supplierName="slotProps">
          <SupplierSelect
            v-bind="slotProps"
            :key="targetUnitCategory"
            :category="targetUnitCategory"
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

        <!-- Description Slot: AI Buttons in Label/Top -->
        <template #description-label>
          <div class="flex w-full items-center justify-between">
            <span>{{ t('qms.inspection.issues.description') }}</span>
            <div class="flex gap-2">
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

        <!-- Photos Slot -->
        <template #photos="slotProps">
          <IssuePhotoUpload v-bind="slotProps" />
        </template>
      </Form>

      <!-- Similar Cases: Outside the Form grid but inside the modal scroll -->
      <IssueSimilarCases
        v-if="matchedCases.length > 0"
        :cases="matchedCases"
        @apply="(solution) => applyCaseSolution(solution)"
      />
    </div>
  </Modal>
</template>

<style scoped>
:deep(.ant-form-item) {
  margin-bottom: 16px;
}
</style>
