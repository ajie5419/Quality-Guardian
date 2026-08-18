import type { Ref } from 'vue';

import { ref, watch } from 'vue';

import { message } from 'ant-design-vue';

import { getPublicInspectionRequestProcesses } from '#/api/qms/inspection-request';
import { useErrorHandler } from '#/hooks/useErrorHandler';

import { INCOMING_INSPECTION_PROCESS_NAME } from '../constants';

export interface ProcessAutoFillOption {
  category: 'INCOMING' | 'PROCESS';
  processId: string;
  processName: string;
  supplierSource: null | string;
}

interface ProcessFormLike {
  incomingType: string;
  processId: string;
  processName: string;
  workOrderNumber: string;
}

/** Loads the process options for the selected work order and keeps the
 * form process selection in sync (incoming type or explicit process). */
export function useInspectionRequestWorkOrderProcesses(options: {
  isIncomingEntry: Ref<boolean>;
  requestForm: ProcessFormLike;
}) {
  const { isIncomingEntry, requestForm } = options;
  const { handleApiError } = useErrorHandler();

  const workOrderProcessesLoading = ref(false);
  const workOrderProcesses = ref<ProcessAutoFillOption[]>([]);

  async function loadWorkOrderProcessOptions(workOrderNumber: string) {
    const normalized = workOrderNumber.trim();
    if (!normalized) {
      workOrderProcesses.value = [];
      requestForm.processId = '';
      requestForm.processName = isIncomingEntry.value
        ? INCOMING_INSPECTION_PROCESS_NAME
        : '';
      return;
    }

    workOrderProcessesLoading.value = true;
    try {
      const list = await getPublicInspectionRequestProcesses({
        workOrderNumber: normalized,
      });
      if (requestForm.workOrderNumber.trim() !== normalized) return;

      workOrderProcesses.value = list || [];
      const selected = isIncomingEntry.value
        ? (requestForm.incomingType
            ? workOrderProcesses.value.find(
                (item) =>
                  item.category === 'INCOMING' &&
                  item.processId === requestForm.incomingType,
              )
            : undefined) ||
          workOrderProcesses.value.find((item) => item.category === 'INCOMING')
        : workOrderProcesses.value.find(
            (item) => item.processId === requestForm.processId,
          );
      if (selected) {
        requestForm.processId = selected.processId;
        requestForm.processName = selected.processName;
      } else {
        requestForm.processId = '';
        requestForm.processName = isIncomingEntry.value
          ? INCOMING_INSPECTION_PROCESS_NAME
          : '';
      }
    } catch (error: unknown) {
      if (requestForm.workOrderNumber.trim() !== normalized) return;

      handleApiError(error, 'Load Inspection Request Processes');
      workOrderProcesses.value = [];
      requestForm.processId = '';
      requestForm.processName = isIncomingEntry.value
        ? INCOMING_INSPECTION_PROCESS_NAME
        : '';
      message.error('工序加载失败，请稍后重试');
    } finally {
      if (requestForm.workOrderNumber.trim() === normalized) {
        workOrderProcessesLoading.value = false;
      }
    }
  }

  watch(
    () => requestForm.workOrderNumber,
    (workOrderNumber) => {
      void loadWorkOrderProcessOptions(workOrderNumber);
    },
    { immediate: true },
  );

  return {
    loadWorkOrderProcessOptions,
    workOrderProcesses,
    workOrderProcessesLoading,
  };
}
