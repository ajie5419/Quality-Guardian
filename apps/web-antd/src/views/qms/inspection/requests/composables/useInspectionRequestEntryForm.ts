import type {
  BomItem,
  InspectionRequestAttachment,
  InspectionRequestCheckResult,
  InspectionRequestCheckResult as InspectionRequestCheckResultValue,
} from '@qgs/shared';
import type { UploadChangeParam, UploadFile } from 'ant-design-vue';

import type { LocationQuery } from 'vue-router';

import { computed, reactive, ref, watch } from 'vue';

import { QMS_DICTIONARY_TYPE_KEYS } from '@qgs/shared';
import { message } from 'ant-design-vue';

import { createInspectionRequest } from '#/api/qms/inspection-request';
import { getBomList } from '#/api/qms/planning';
import { getWorkOrderRequirements } from '#/api/qms/work-order';
import {
  applyUploadResponse,
  normalizeUploadFileList,
} from '#/views/qms/shared/utils/upload-file';

import { useDictionaryOptions } from '../../../shared/composables/useDictionaryOptions';
import { cloneInspectionProcessFallbackOptions } from '../../../shared/constants/inspection-process-fallback';
import { mapDictionaryOptionsToInspectionProcess } from '../../records/config';

interface UseInspectionRequestEntryFormOptions {
  onSubmitted: () => Promise<void> | void;
}

interface RequestFormState {
  attachments: InspectionRequestAttachment[];
  componentName: string;
  mutualCheckResult: InspectionRequestCheckResult;
  partName: string;
  processName: string;
  quantity: number;
  reporter: string;
  requestInfo: string;
  selfCheckResult: InspectionRequestCheckResult;
  team: string;
  workOrderNumber: string;
}

const DEFAULT_CHECK_RESULT: InspectionRequestCheckResultValue = 'PASS';

export function useInspectionRequestEntryForm(
  options: UseInspectionRequestEntryFormOptions,
) {
  const { onSubmitted } = options;

  const submitting = ref(false);
  const attachmentFileList = ref<UploadFile[]>([]);
  const bomPartsLoading = ref(false);
  const bomPartOptions = ref<Array<{ label: string; value: string }>>([]);
  const workOrderRequirementsLoading = ref(false);
  const requirementProcessOptions = ref<
    Array<{ label: string; value: string }>
  >([]);
  const {
    options: dictionaryProcessOptions,
    loadOptions: loadInspectionProcessOptions,
  } = useDictionaryOptions({
    dictType: QMS_DICTIONARY_TYPE_KEYS.inspectionProcessName,
    fallbackOptions: cloneInspectionProcessFallbackOptions(),
    mapOptions: (options, fallbackOptions) =>
      mapDictionaryOptionsToInspectionProcess(options, fallbackOptions),
  });

  const requestForm = reactive<RequestFormState>({
    attachments: [],
    componentName: '',
    mutualCheckResult: DEFAULT_CHECK_RESULT,
    partName: '',
    processName: '',
    quantity: 1,
    reporter: '',
    requestInfo: '',
    selfCheckResult: DEFAULT_CHECK_RESULT,
    team: '',
    workOrderNumber: '',
  });

  const checkResultOptions = [
    { label: '合格', value: 'PASS' },
    { label: '不合格', value: 'FAIL' },
    { label: '不适用', value: 'NA' },
  ];

  const processOptions = computed(() => {
    const fallbackOptions = cloneInspectionProcessFallbackOptions();
    const map = new Map<string, { label: string; value: string }>();
    for (const option of mapDictionaryOptionsToInspectionProcess(
      undefined,
      fallbackOptions,
    )) {
      map.set(option.value, option);
    }
    for (const option of dictionaryProcessOptions.value) {
      map.set(option.value, option);
    }
    for (const option of requirementProcessOptions.value) {
      map.set(option.value, option);
    }
    return [...map.values()];
  });

  const isRequestAssemblyProcess = computed(() =>
    String(requestForm.processName || '').includes('组装'),
  );

  function resetRequestForm() {
    attachmentFileList.value = [];
    requestForm.attachments = [];
    requestForm.componentName = '';
    requestForm.partName = '';
    requestForm.processName = '';
    requestForm.quantity = 1;
    requestForm.reporter = '';
    requestForm.requestInfo = '';
    requestForm.selfCheckResult = DEFAULT_CHECK_RESULT;
    requestForm.mutualCheckResult = DEFAULT_CHECK_RESULT;
    requestForm.team = '';
  }

  function syncAttachmentsFromFiles(files: UploadFile[]) {
    requestForm.attachments =
      normalizeUploadFileList<InspectionRequestAttachment>(files, '自检记录');
  }

  function handleAttachmentUploadChange(info: UploadChangeParam<UploadFile>) {
    if (info.file.status === 'done') {
      if (applyUploadResponse(info.file)) {
        message.success(`${info.file.name} 上传成功`);
      } else {
        message.warning('自检记录上传完成，但未返回有效地址');
      }
    } else if (info.file.status === 'error') {
      message.error(`${info.file.name} 上传失败`);
    }

    attachmentFileList.value = [...info.fileList];
    syncAttachmentsFromFiles(attachmentFileList.value);
  }

  async function loadBomPartOptions(workOrderNumber: string) {
    const normalized = (workOrderNumber || '').trim();
    if (!normalized) {
      bomPartOptions.value = [];
      requestForm.partName = '';
      return;
    }

    bomPartsLoading.value = true;
    try {
      const list = await getBomList({ projectId: normalized });
      if (requestForm.workOrderNumber !== normalized) return;

      const parts = new Map<string, BomItem>();
      for (const item of list || []) {
        const partName = String(item.partName || '').trim();
        if (partName) parts.set(partName, item);
      }
      bomPartOptions.value = [...parts.values()].map((item) => ({
        label: item.partNumber
          ? `${item.partName} (${item.partNumber})`
          : item.partName,
        value: item.partName,
      }));

      if (
        requestForm.partName &&
        !bomPartOptions.value.some(
          (item) => item.value === requestForm.partName,
        )
      ) {
        requestForm.partName = '';
      }
    } catch {
      bomPartOptions.value = [];
    } finally {
      if (requestForm.workOrderNumber === normalized) {
        bomPartsLoading.value = false;
      }
    }
  }

  async function loadWorkOrderRequirementOptions(workOrderNumber: string) {
    const normalized = workOrderNumber.trim();
    if (!normalized) {
      requirementProcessOptions.value = [];
      return;
    }

    workOrderRequirementsLoading.value = true;
    try {
      const list = await getWorkOrderRequirements({
        workOrderNumber: normalized,
      });
      if (requestForm.workOrderNumber !== normalized) return;

      const processNames = new Set<string>();
      for (const item of list || []) {
        const processName = String(item.processName || '').trim();
        if (processName) processNames.add(processName);
      }
      requirementProcessOptions.value = [...processNames].map(
        (processName) => ({
          label: processName,
          value: processName,
        }),
      );
    } catch {
      requirementProcessOptions.value = [];
    } finally {
      if (requestForm.workOrderNumber === normalized) {
        workOrderRequirementsLoading.value = false;
      }
    }
  }

  function applyRoutePrefill(routeQuery: LocationQuery) {
    requestForm.workOrderNumber = String(routeQuery.workOrderNumber || '');
    requestForm.partName = String(routeQuery.partName || '');
    requestForm.componentName = String(routeQuery.componentName || '');
    requestForm.processName = String(routeQuery.processName || '');
    requestForm.reporter = String(routeQuery.reporter || '');
    requestForm.team = String(routeQuery.team || '');
  }

  async function submitRequest() {
    if (
      !requestForm.workOrderNumber ||
      !requestForm.partName ||
      !requestForm.processName ||
      (!isRequestAssemblyProcess.value && !requestForm.componentName) ||
      !requestForm.quantity ||
      !requestForm.team ||
      !requestForm.reporter ||
      requestForm.attachments.length === 0
    ) {
      message.warning(
        '工单号、一级部件名称、工序、组件名称、数量、班组、报检人、自检记录不能为空',
      );
      return;
    }

    submitting.value = true;
    try {
      await createInspectionRequest({
        ...requestForm,
        componentName: isRequestAssemblyProcess.value
          ? ''
          : requestForm.componentName,
      });
      message.success('报检任务已报检');
      resetRequestForm();
      await onSubmitted();
    } finally {
      submitting.value = false;
    }
  }

  watch(
    () => requestForm.workOrderNumber,
    (workOrderNumber) => {
      void Promise.all([
        loadBomPartOptions(workOrderNumber),
        loadWorkOrderRequirementOptions(workOrderNumber),
      ]);
    },
  );

  watch(
    () => requestForm.processName,
    () => {
      if (isRequestAssemblyProcess.value) {
        requestForm.componentName = '';
      }
    },
  );

  void loadInspectionProcessOptions();

  return {
    attachmentFileList,
    bomPartOptions,
    bomPartsLoading,
    checkResultOptions,
    isRequestAssemblyProcess,
    processOptions,
    requestForm,
    submitting,
    workOrderRequirementsLoading,
    applyRoutePrefill,
    handleAttachmentUploadChange,
    submitRequest,
  };
}
