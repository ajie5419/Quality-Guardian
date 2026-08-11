import type { QmsInspectionApi } from '#/api/qms/inspection';

import { ref } from 'vue';

import {
  buildInspectionIssuePayload,
  normalizeInspectionIssueCanonicalId,
  normalizeInspectionIssueText,
} from '@qgs/shared';
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
  defectCategoryId?: string;
  defectSubcategoryId?: string;
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
  supplierId?: string;
  responsibilityType?: string;
  responsibleDepartmentId?: string;
  severity?: 'Critical' | 'Major' | 'Minor';
}

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
      const persistedSupplierIdentity = inspectionRecord as {
        supplierId?: null | string;
        supplierName?: null | string;
      };

      const inspectionId = String(
        inspectionRecord?.id || currentRecord.value?.id || '',
      );
      if (linkedIssue.enabled && inspectionId) {
        try {
          const supplierId =
            normalizeInspectionIssueCanonicalId(
              persistedSupplierIdentity.supplierId,
            ) ||
            normalizeInspectionIssueCanonicalId(linkedIssue.supplierId) ||
            normalizeInspectionIssueCanonicalId(values.supplierId);
          const issuePayload = buildInspectionIssuePayload({
            claim: linkedIssue.claim || 'No',
            defectCategoryId: linkedIssue.defectCategoryId,
            defectSubcategoryId: linkedIssue.defectSubcategoryId,
            defectSubtype: linkedIssue.defectSubtype,
            defectType: linkedIssue.defectType,
            description: linkedIssue.description,
            inspectionId,
            lossAmount: Number(linkedIssue.lossAmount || 0),
            partName:
              linkedIssue.partName ||
              normalizeInspectionIssueText(values.materialName),
            processName:
              linkedIssue.processName ||
              normalizeInspectionIssueText(values.processName) ||
              normalizeInspectionIssueText(values.incomingType) ||
              '成品检验',
            projectName: normalizeInspectionIssueText(values.projectName),
            quantity: Number(linkedIssue.quantity || values.quantity || 1),
            reportDate:
              linkedIssue.reportDate ||
              normalizeInspectionIssueText(values.inspectionDate),
            reportedBy:
              linkedIssue.reportedBy ||
              normalizeInspectionIssueText(values.inspector),
            responsibilityType: linkedIssue.responsibilityType,
            responsibleDepartmentId: linkedIssue.responsibleDepartmentId,
            responsibleWelder: linkedIssue.responsibleWelder || undefined,
            rootCause: linkedIssue.rootCause || '',
            severity: linkedIssue.severity || 'Minor',
            solution: linkedIssue.solution || '',
            status: linkedIssue.status || 'OPEN',
            supplierId: supplierId || undefined,
            sourceType: 'INSPECTION_RECORD',
            photos: Array.isArray(linkedIssue.photos) ? linkedIssue.photos : [],
            workOrderNumber: normalizeInspectionIssueText(
              values.workOrderNumber,
            ),
          });
          await createInspectionIssue(issuePayload);
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
