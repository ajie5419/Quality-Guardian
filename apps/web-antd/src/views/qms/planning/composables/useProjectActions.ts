import type { PlanningTreeNode } from '../types';

import { useI18n } from '@vben/locales';

import { message, Modal } from 'ant-design-vue';

import { ProjectStatusEnum } from '#/api/qms/enums';
import { useErrorHandler } from '#/hooks/useErrorHandler';

/**
 * 通用项目操作 Hook
 * 统一处理归档、删除等操作
 */
export function useProjectActions<
  T extends PlanningTreeNode = PlanningTreeNode,
>(
  options: {
    /** 归档/恢复项目的函数 */
    archiveProject?: (id: string, status: string, project?: T) => Promise<void>;
    /** 删除项目明细的函数 */
    deleteItem?: (id: string, projectId?: string) => Promise<void>;
    /** 删除项目的函数 */
    deleteProject?: (id: string) => Promise<void>;
    /** 数据加载函数 */
    loadData?: () => Promise<void>;
    /** 归档时是否传递完整项目数据 */
    passFullProjectOnArchive?: boolean;
    /** 成功后是否重置选中项 */
    resetSelectionOnDelete?: boolean;
    /** 当前选中的项目ID */
    selectedProjectId?: { value: null | string };
  } = {},
) {
  const { t } = useI18n();
  const { handleApiError } = useErrorHandler();

  const {
    archiveProject,
    deleteProject,
    deleteItem,
    loadData,
    selectedProjectId,
    resetSelectionOnDelete = true,
    passFullProjectOnArchive = false,
  } = options;

  /**
   * 判断是否为归档状态
   */
  const isArchivedStatus = (status?: string) => {
    const s = String(status || '').toLowerCase();
    return [
      'archived',
      'closed',
      'completed',
      ProjectStatusEnum.ARCHIVED,
      '已完成',
      '已归档',
    ].includes(s);
  };

  const runConfirmedAction = async (
    action: () => Promise<void>,
    successMessage: string,
    errorContext: string,
  ) => {
    try {
      await action();
      message.success(successMessage);
      await loadData?.();
    } catch (error) {
      handleApiError(error, errorContext);
      message.error(t('common.actionFailed'));
    }
  };

  /**
   * 归档/恢复项目
   */
  const handleArchiveProject = async (project: T) => {
    if (!project?.id || !archiveProject) return;

    const isArchived = isArchivedStatus(project.status as string);
    const newStatus = isArchived
      ? ProjectStatusEnum.ACTIVE
      : ProjectStatusEnum.ARCHIVED;

    Modal.confirm({
      title: isArchived ? t('common.restore') : t('common.archive'),
      content: isArchived
        ? `${t('common.confirmRestoreContent')} "${project.name}" ?`
        : `${t('common.confirmArchiveContent')} "${project.name}" ?`,
      onOk: async () => {
        await runConfirmedAction(
          async () => {
            await archiveProject(
              project.id,
              newStatus,
              passFullProjectOnArchive ? project : undefined,
            );

            // 如果归档的是当前选中的项目，清除选中
            if (
              resetSelectionOnDelete &&
              selectedProjectId?.value === project.id
            ) {
              selectedProjectId.value = null;
            }
          },
          isArchived ? t('common.restoreSuccess') : t('common.archiveSuccess'),
          'Archive Or Restore Project',
        );
      },
    });
  };

  /**
   * 删除项目
   */
  const handleDeleteProject = async (project: T) => {
    if (!project?.id || !deleteProject) return;

    Modal.confirm({
      title: t('common.confirmDelete'),
      content: t('common.confirmDeleteContent', {
        name: project.name || project.projectName,
      }),
      onOk: async () => {
        await runConfirmedAction(
          async () => {
            await deleteProject(project.id);

            if (
              resetSelectionOnDelete &&
              selectedProjectId?.value === project.id
            ) {
              selectedProjectId.value = null;
            }
          },
          t('common.deleteSuccess'),
          'Delete Planning Project',
        );
      },
    });
  };

  /**
   * 删除项目明细（如 BOM 物料、DFMEA 项目等）
   */
  const handleDeleteItem = async (item: T, projectId?: string) => {
    if (!item?.id || !deleteItem) return;

    Modal.confirm({
      title: t('common.confirmDelete'),
      content: t('common.confirmDeleteContent', {
        name: item.name || item.partName || item.item,
      }),
      onOk: async () => {
        await runConfirmedAction(
          async () => {
            await deleteItem(item.id, projectId);
          },
          t('common.deleteSuccess'),
          'Delete Planning Item',
        );
      },
    });
  };

  return {
    handleArchiveProject,
    handleDeleteProject,
    handleDeleteItem,
    isArchivedStatus,
  };
}
