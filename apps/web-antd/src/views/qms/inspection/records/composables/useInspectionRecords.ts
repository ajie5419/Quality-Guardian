import type { QmsInspectionApi } from '#/api/qms/inspection';

import { ref } from 'vue';

import { message } from 'ant-design-vue';

import {
  createInspectionIssue,
  createInspectionRecord,
  updateInspectionRecord,
} from '#/api/qms/inspection';
import { useErrorHandler } from '#/hooks/useErrorHandler';

interface FormRefLike {
  getValues: () => Promise<Record<string, unknown>>;
  validate: () => Promise<void>;
}

interface GridRefLike {
  reload: () => void;
}

interface LinkedIssuePayload {
  claim?: string;
  defectSubtype?: string;
  defectType?: string;
  description?: string;
  enabled?: boolean;
  lossAmount?: number;
  partName?: string;
  processName?: string;
  quantity?: number;
  reportDate?: string;
  reportedBy?: string;
  responsibleWelder?: string;
  rootCause?: string;
  solution?: string;
  photos?: string[];
  status?: string;
  supplierName?: string;
  responsibleDepartment?: string;
  severity?: 'Critical' | 'Major' | 'Minor';
}

type InspectionIssueCreatePayload = {
  claim?: string;
  defectSubtype?: string;
  defectType?: string;
  description?: string;
  inspectionId?: string;
  lossAmount?: number;
  partName?: string;
  photos?: string[];
  processName?: string;
  projectName?: string;
  quantity?: number;
  reportDate?: string;
  reportedBy?: string;
  responsibleDepartment?: string;
  responsibleWelder?: string;
  rootCause?: string;
  severity?: 'Critical' | 'Major' | 'Minor';
  solution?: string;
  sourceType?: string;
  status?: string;
  supplierName?: string;
  workOrderNumber?: string;
};

export function useInspectionRecords() {
  const { handleApiError } = useErrorHandler();
  const activeKey = ref('incoming');
  const currentYear = ref(new Date().getFullYear());
  const yearOptions = [2024, 2025, 2026].map((y) => ({
    label: `${y}年`,
    value: y,
  }));

  const gridRef = ref<GridRefLike>();
  const formRef = ref<FormRefLike>();
  const modalVisible = ref(false);
  const currentRecord = ref<QmsInspectionApi.InspectionRecord | undefined>(
    undefined,
  );
  const isEdit = ref(false);

  function openModal(record?: QmsInspectionApi.InspectionRecord) {
    isEdit.value = !!record;
    currentRecord.value = record || undefined;
    modalVisible.value = true;
  }

  async function handleSubmit() {
    if (!formRef.value) return;

    try {
      await formRef.value.validate();
      const values = await formRef.value.getValues();
      const linkedIssue = (values.linkedIssue || {}) as LinkedIssuePayload;
      delete values.linkedIssue;
      // Transform category
      values.category = activeKey.value.toUpperCase();

      const inspectionRecord =
        isEdit.value && currentRecord.value?.id
          ? await updateInspectionRecord(currentRecord.value.id, values)
          : await createInspectionRecord(values);

      const inspectionId = String(
        inspectionRecord?.id || currentRecord.value?.id || '',
      );
      if (linkedIssue.enabled && inspectionId) {
        try {
          const issuePayload: InspectionIssueCreatePayload = {
            claim: linkedIssue.claim || 'No',
            defectSubtype: linkedIssue.defectSubtype,
            defectType: linkedIssue.defectType || '制造缺陷',
            description: linkedIssue.description,
            inspectionId,
            lossAmount: Number(linkedIssue.lossAmount || 0),
            partName: linkedIssue.partName || String(values.materialName || ''),
            processName:
              linkedIssue.processName ||
              String(values.processName || values.incomingType || '成品检验'),
            projectName: String(values.projectName || ''),
            quantity: Number(linkedIssue.quantity || values.quantity || 1),
            reportDate:
              linkedIssue.reportDate || String(values.inspectionDate || ''),
            reportedBy:
              linkedIssue.reportedBy || String(values.inspector || ''),
            responsibleDepartment:
              linkedIssue.responsibleDepartment ||
              String(values.team || '质量部'),
            responsibleWelder: linkedIssue.responsibleWelder || undefined,
            rootCause: linkedIssue.rootCause || '',
            severity: linkedIssue.severity || 'Minor',
            solution: linkedIssue.solution || '',
            status: linkedIssue.status || 'OPEN',
            supplierName:
              linkedIssue.supplierName || String(values.supplierName || ''),
            sourceType: 'INSPECTION_RECORD',
            photos: Array.isArray(linkedIssue.photos) ? linkedIssue.photos : [],
            workOrderNumber: String(values.workOrderNumber || ''),
          };
          await createInspectionIssue(
            issuePayload as Partial<QmsInspectionApi.InspectionIssue>,
          );
          message.success('已自动创建关联不合格项');
        } catch (issueError) {
          handleApiError(issueError, 'Create Linked Inspection Issue');
          message.warning('检验记录已保存，但关联不合格项创建失败');
        }
      }

      message.success('保存成功');
      modalVisible.value = false;
      currentRecord.value = undefined;
      gridRef.value?.reload();
    } catch (error: unknown) {
      handleApiError(error, 'Submit Inspection Record');
      let errorMsg = '提交失败，请重试';
      if (error instanceof Error) {
        errorMsg = error.message;
      } else if (typeof error === 'string') {
        errorMsg = error;
      }
      message.error(errorMsg);
    }
  }

  return {
    activeKey,
    currentYear,
    yearOptions,
    gridRef,
    formRef,
    modalVisible,
    currentRecord,
    isEdit,
    openModal,
    handleSubmit,
  };
}
