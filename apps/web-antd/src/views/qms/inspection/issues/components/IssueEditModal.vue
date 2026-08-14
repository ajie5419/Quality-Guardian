<script lang="ts" setup>
import type { StatusOption } from '../constants';
import type { DeptNode, InspectionIssue } from '../types';

import { computed, nextTick, ref, watch } from 'vue';

import { useI18n } from '@vben/locales';
import { useUserStore } from '@vben/stores';

import { message, Modal } from 'ant-design-vue';

import {
  createInspectionIssue,
  updateInspectionIssue,
} from '#/api/qms/inspection';
import { useAdaptivePopup } from '#/hooks/useAdaptivePopup';
import { useErrorHandler } from '#/hooks/useErrorHandler';
import { buildThumbUrlFromOriginal } from '#/views/qms/shared/utils/photo-url';
import { getUploadResponse } from '#/views/qms/shared/utils/upload-file';

import { DEFAULT_VALUES } from '../constants';
import IssueFormFields from './IssueFormFields.vue';
import {
  buildInspectionIssuePayload,
  normalizeInspectionIssueCanonicalId,
} from './issueFormPayload';

const props = defineProps<{
  deptTreeData: DeptNode[];
  initialData?: Partial<InspectionIssue>;
  isEditMode: boolean;
  open: boolean;
  processOptions?: Array<{ label: string; value: string }>;
  statusOptions?: StatusOption[];
}>();

const emit = defineEmits<{
  searchWorkOrder: [string];
  success: [];
  'update:open': [boolean];
}>();

const { isMobile, modalWidth, modalWrapClassName } = useAdaptivePopup();
const { t } = useI18n();
const { handleApiError } = useErrorHandler();
const userStore = useUserStore();
const submitting = ref(false);
const formFieldsRef = ref<InstanceType<typeof IssueFormFields> | null>(null);

type UploadPhotoItem = {
  response?: unknown;
  status?: string;
  url?: string;
};
type IssueSubmitValues = Omit<Partial<InspectionIssue>, 'photos'> & {
  id?: string;
  photos?: UploadPhotoItem[];
};

function resolveInitialResponsibleDepartmentId(
  values: Partial<InspectionIssue>,
): string {
  const explicitId = normalizeInspectionIssueCanonicalId(
    values.responsibleDepartmentId,
  );
  if (explicitId) return explicitId;
  const legacyIds = Array.isArray(values.responsibleDepartments)
    ? values.responsibleDepartments
    : [];
  const legacyId = normalizeInspectionIssueCanonicalId(legacyIds[0]);
  if (legacyId) return legacyId;
  return normalizeInspectionIssueCanonicalId(values.responsibleDepartment);
}

function buildInitialData() {
  const inspector =
    userStore.userInfo?.realName || userStore.userInfo?.username || '';
  return {
    generateNcNumber: false,
    reportDate: new Date().toISOString().split('T')[0],
    status: DEFAULT_VALUES.DEFAULT_STATUS,
    quantity: DEFAULT_VALUES.DEFAULT_QUANTITY,
    lossAmount: 0,
    inspector,
    claim: DEFAULT_VALUES.DEFAULT_CLAIM,
    photos: [],
    responsibilityType: 'INTERNAL_DEPARTMENT',
    responsibleDepartmentId: '',
    severity: DEFAULT_VALUES.DEFAULT_SEVERITY,
  };
}

async function applyEditData(data: Partial<InspectionIssue>) {
  const fields = formFieldsRef.value;
  if (!fields) return;
  const { photos, ...rest } = data;
  const responsibleDepartmentId = resolveInitialResponsibleDepartmentId(rest);
  let photoArray: string[] = [];
  if (Array.isArray(photos)) {
    photoArray = photos;
  } else if (photos) {
    photoArray = [photos as unknown as string];
  }
  await fields.setValues({
    ...rest,
    responsibleDepartmentId,
    photos: photoArray.map((url, index) => ({
      uid: `photo-${encodeURIComponent(url)}-${index}`,
      name: `Photo ${index + 1}`,
      status: 'done' as const,
      thumbUrl: buildThumbUrlFromOriginal(url),
      url,
    })),
  });
}

async function resetToCreate() {
  const fields = formFieldsRef.value;
  if (!fields) return;
  await fields.resetForm();
  await fields.setValues(buildInitialData());
  fields.clearMatchedCases();
}

watch(
  () => props.open,
  async (val) => {
    if (!val) return;
    await nextTick();
    await (props.isEditMode && props.initialData
      ? applyEditData(props.initialData)
      : resetToCreate());
  },
);

const modalTitle = computed(() =>
  props.isEditMode
    ? t('qms.inspection.issues.editIssue')
    : t('qms.inspection.issues.createIssue'),
);

async function handleOk() {
  const fields = formFieldsRef.value;
  if (!fields || submitting.value) return;
  try {
    submitting.value = true;
    const { valid } = await fields.validate();
    if (!valid) return;
    const rawData = (await fields.getValues()) as IssueSubmitValues;
    const photos =
      rawData.photos
        ?.map((file) => {
          if (file.url) return file.url;
          const response = getUploadResponse(file);
          if (file.status === 'done' && response?.data?.url) {
            return response.data.url;
          }
          return null;
        })
        .filter((url): url is string => !!url) || [];
    const data = buildInspectionIssuePayload({
      ...rawData,
      photos,
      severity: rawData.severity || DEFAULT_VALUES.DEFAULT_SEVERITY,
    });
    if (props.isEditMode && data.id) {
      await updateInspectionIssue(data.id, data);
      message.success(t('common.saveSuccess'));
    } else {
      await createInspectionIssue(data);
      message.success(t('common.createSuccess'));
    }
    emit('update:open', false);
    emit('success');
  } catch (error) {
    handleApiError(error, 'Save Inspection Issue');
    const errorMessage =
      error instanceof Error ? error.message : t('common.saveFailed');
    message.error(errorMessage);
  } finally {
    submitting.value = false;
  }
}

function handleCancel() {
  emit('update:open', false);
}
</script>

<template>
  <Modal
    :confirm-loading="submitting"
    :open="open"
    :title="modalTitle"
    :width="isMobile ? modalWidth : '900px'"
    :wrap-class-name="`${modalWrapClassName} issue-edit-modal-wrap`"
    @cancel="handleCancel"
    @ok="handleOk"
  >
    <div
      class="max-h-[70vh] min-w-0 overflow-y-auto overflow-x-hidden p-1 sm:max-h-[700px] sm:p-2"
    >
      <IssueFormFields
        ref="formFieldsRef"
        mode="standalone"
        :is-edit-mode="isEditMode"
        :dept-tree-data="deptTreeData"
        :process-options="processOptions"
        :status-options="statusOptions"
        @search-work-order="(value) => emit('searchWorkOrder', value)"
      />
    </div>
  </Modal>
</template>

<style scoped>
:global(.issue-edit-modal-wrap .ant-modal) {
  max-width: calc(100vw - 16px);
}

:global(.issue-edit-modal-wrap .ant-modal-content) {
  overflow-x: hidden;
}

:global(.issue-edit-modal-wrap .ant-modal-body) {
  overflow-x: hidden;
}

:global(.issue-edit-modal-wrap.qms-mobile-modal .ant-modal-body) {
  max-height: calc(100dvh - 112px);
}
</style>
