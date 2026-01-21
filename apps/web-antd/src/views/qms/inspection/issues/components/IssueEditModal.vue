<script lang="ts" setup>
import type {
  DeptNode,
  InspectionIssue,
  SupplierItem,
  WorkOrderItem,
} from '../types';

import { computed, ref, toRef, watch } from 'vue';

import { useI18n } from '@vben/locales';

import { Form, Modal } from 'ant-design-vue';

import { useAiAnalysis } from '../composables/useAiAnalysis';
import { useIssueForm } from '../composables/useIssueForm';
import { useNcNumber } from '../composables/useNcNumber';
import IssueBasicInfo from './IssueBasicInfo.vue';
import IssueDefectInfo from './IssueDefectInfo.vue';
import IssuePhotoUpload from './IssuePhotoUpload.vue';
import IssueSimilarCases from './IssueSimilarCases.vue';

const props = defineProps<{
  deptTreeData: DeptNode[];
  initialData?: Partial<InspectionIssue>;
  isEditMode: boolean;
  open: boolean;
  supplierList: SupplierItem[];
  workOrderList: WorkOrderItem[];
}>();

const emit = defineEmits<{
  success: [];
  'update:open': [boolean];
}>();

const { t } = useI18n();
const formRef = ref();

const rules = computed(() => ({
  reportDate: [
    {
      required: true,
      message: t('ui.formRules.required', [
        t('qms.inspection.issues.reportDate'),
      ]),
    },
  ],
  workOrderNumber: [
    {
      required: true,
      message: t('ui.formRules.selectRequired', [
        t('qms.workOrder.workOrderNumber'),
      ]),
    },
  ],
  partName: [
    {
      required: true,
      message: t('ui.formRules.required', [
        t('qms.inspection.issues.partName'),
      ]),
    },
  ],
  quantity: [
    {
      required: true,
      message: t('ui.formRules.required', [t('qms.workOrder.quantity')]),
    },
  ],
  responsibleDepartment: [
    {
      required: true,
      message: t('ui.formRules.selectRequired', [
        t('qms.inspection.issues.responsibleDepartment'),
      ]),
    },
  ],
  status: [
    {
      required: true,
      message: t('ui.formRules.selectRequired', [
        t('qms.inspection.issues.statusLabel'),
      ]),
    },
  ],
  defectType: [
    {
      required: true,
      message: t('ui.formRules.selectRequired', [
        t('qms.inspection.issues.defectType'),
      ]),
    },
  ],
  defectSubtype: [
    {
      required: true,
      message: t('ui.formRules.selectRequired', [
        t('qms.inspection.issues.defectSubtype'),
      ]),
    },
  ],
  description: [
    {
      required: true,
      message: t('ui.formRules.required', [
        t('qms.inspection.issues.description'),
      ]),
    },
  ],
  severity: [
    {
      required: true,
      message: t('ui.formRules.selectRequired', [
        t('qms.inspection.issues.severity'),
      ]),
    },
  ],
}));

// Refs for composables
const openRef = toRef(props, 'open');
const isEditModeRef = toRef(props, 'isEditMode');
const initialDataRef = computed(() => props.initialData);

// 表单逻辑
const { formState, validateAndSubmit } = useIssueForm({
  initialData: initialDataRef,
  isEditMode: isEditModeRef,
  open: openRef,
  onSuccess: () => emit('success'),
  onClose: () => emit('update:open', false),
});

// NC 编号生成
const { isAutoNc, resetAutoNc } = useNcNumber({
  formState,
  isEditMode: isEditModeRef,
});

// AI 分析
const {
  isAiAnalyzing,
  isMatchingCases,
  matchedCases,
  analyzeIssue,
  matchHistory,
  applyCaseSolution,
  clearMatchedCases,
} = useAiAnalysis({ formState });

// 重置状态
watch(openRef, (val) => {
  if (val && !props.isEditMode) {
    resetAutoNc();
    clearMatchedCases();
  }
});

async function handleOk() {
  try {
    await formRef.value.validate();
    validateAndSubmit();
  } catch {
    // validation failed
  }
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
    <Form ref="formRef" :model="formState" :rules="rules" layout="vertical">
      <div class="max-h-[650px] overflow-y-auto p-2">
        <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
          <!-- 左侧列：基本信息 -->
          <IssueBasicInfo
            v-model:form-state="formState"
            v-model:is-auto-nc="isAutoNc"
            :dept-tree-data="deptTreeData"
            :is-edit-mode="isEditMode"
            :supplier-list="supplierList"
            :work-order-list="workOrderList"
          />

          <!-- 右侧列：缺陷信息 -->
          <div class="space-y-4">
            <IssueDefectInfo
              v-model:form-state="formState"
              :is-ai-analyzing="isAiAnalyzing"
              :is-matching-cases="isMatchingCases"
              @ai-analyze="analyzeIssue"
              @match-history="matchHistory"
            />

            <!-- 照片上传 -->
            <IssuePhotoUpload v-model:photos="formState.photos" />
          </div>
        </div>

        <!-- 相似案例推荐 -->
        <IssueSimilarCases :cases="matchedCases" @apply="applyCaseSolution" />
      </div>
    </Form>
  </Modal>
</template>
