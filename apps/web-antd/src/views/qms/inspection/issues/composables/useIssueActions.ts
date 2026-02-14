import type { Ref } from 'vue';

import type { InspectionIssue } from '../types';

import { ref } from 'vue';

import { message, Modal } from 'ant-design-vue';

import {
  batchDeleteInspectionIssues,
  deleteInspectionIssue,
} from '#/api/qms/inspection';
import { useKnowledgeSettlement } from '#/hooks/useKnowledgeSettlement';

export function useIssueActions(options: {
  checkedRows: Ref<InspectionIssue[]>;
  gridApi: { reload: () => void };
  invalidateInspectionIssues: () => void;
  onAfterDeleteSuccess: () => void;
  t: (...args: any[]) => string;
}) {
  const {
    checkedRows,
    gridApi,
    invalidateInspectionIssues,
    onAfterDeleteSuccess,
    t,
  } = options;
  const modalVisible = ref(false);
  const isEditMode = ref(false);
  const currentRecord = ref<InspectionIssue | null>(null);

  const { settle: settleToKnowledge } = useKnowledgeSettlement();

  function handleOpenModal() {
    isEditMode.value = false;
    currentRecord.value = null;
    modalVisible.value = true;
  }

  function handleEdit(row: InspectionIssue) {
    isEditMode.value = true;
    currentRecord.value = { ...row };
    modalVisible.value = true;
  }

  async function handleDelete(row: InspectionIssue) {
    Modal.confirm({
      title: t('qms.inspection.issues.deleteConfirm'),
      content: t('qms.inspection.issues.deleteContent', {
        ncNumber: row.ncNumber,
      }),
      onOk: async () => {
        try {
          await deleteInspectionIssue(row.id);
          message.success(t('common.deleteSuccess'));
          invalidateInspectionIssues();
          gridApi.reload();
          onAfterDeleteSuccess();
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : t('common.deleteFailed');
          message.error(errorMessage);
        }
      },
    });
  }

  function handleBatchDelete() {
    if (checkedRows.value.length === 0) {
      message.warning(t('common.pleaseSelectData'));
      return;
    }
    Modal.confirm({
      title: t('common.confirmBatchDelete'),
      content: t('common.confirmBatchDeleteContent', {
        count: checkedRows.value.length,
      }),
      onOk: async () => {
        try {
          const ids = checkedRows.value.map((r: InspectionIssue) => r.id);
          const res = await batchDeleteInspectionIssues(ids);
          message.success(
            t('common.deleteSuccessCount', { count: res.successCount }),
          );
          invalidateInspectionIssues();
          gridApi.reload();
          onAfterDeleteSuccess();
        } catch {
          message.error(t('common.deleteFailed'));
        }
      },
    });
  }

  function handleSettleToKnowledge(row: InspectionIssue) {
    settleToKnowledge({
      title: `【${t('qms.dashboard.overview.processIssues')}】${
        row.workOrderNumber || ''
      } - ${row.partName}`,
      summary: row.description,
      categoryId: 'CAT-DEFAULT',
      photos: row.photos,
      attachmentNamePrefix: '现场图片',
      tags: [row.defectType, row.division, row.partName, row.projectName],
      sections: [
        {
          title: t('qms.inspection.issues.description'),
          fields: [
            {
              label: t('qms.workOrder.workOrderNumber'),
              value: row.workOrderNumber,
            },
            { label: t('qms.workOrder.projectName'), value: row.projectName },
            { label: t('qms.inspection.issues.partName'), value: row.partName },
          ],
        },
        {
          title: t('qms.inspection.issues.description'),
          content: row.description,
        },
        {
          title: t('qms.inspection.issues.rootCause'),
          content: row.rootCause || t('common.unknown'),
        },
        {
          title: t('qms.inspection.issues.solution'),
          content: row.solution || t('common.notSet'),
        },
      ],
    });
  }

  return {
    modalVisible,
    isEditMode,
    currentRecord,
    handleOpenModal,
    handleEdit,
    handleDelete,
    handleBatchDelete,
    handleSettleToKnowledge,
  };
}
