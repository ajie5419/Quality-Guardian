import { ProjectStatusEnum } from '#/api/qms/enums';

import { message, Modal } from 'ant-design-vue';

import { useI18n } from '@vben/locales';

import type { PlanningTreeNode } from '../types';

/**
 * 通用项目操作 Hook
 * 统一处理归档、删除等操作
 */
export function useProjectActions<T extends PlanningTreeNode = PlanningTreeNode>(
  options: {
    /** 归档/恢复项目的函数 */
    archiveProject?: (id: string, status: string, project?: T) => Promise<void>;
    /** 删除项目的函数 */
    deleteProject?: (id: string) => Promise<void>;
    /** 删除项目明细的函数 */
    deleteItem?: (id: string, projectId?: string) => Promise<void>;
    /** 数据加载函数 */
    loadData?: () => Promise<void>;
    /** 当前选中的项目ID */
    selectedProjectId?: { value: string | null };
    /** 成功后是否重置选中项 */
    resetSelectionOnDelete?: boolean;
    /** 归档时是否传递完整项目数据 */
    passFullProjectOnArchive?: boolean;
  } = {},
) {
  const { t } = useI18n();

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

  /**
   * 归档/恢复项目
   */
  const handleArchiveProject = async (project: T) => {
    if (!project?.id || !archiveProject) return;

    const isArchived = isArchivedStatus(project.status as string);
    const newStatus = isArchived ? ProjectStatusEnum.ACTIVE : ProjectStatusEnum.ARCHIVED;

    Modal.confirm({
      title: isArchived ? t('common.restore') : t('common.archive'),
      content: isArchived
        ? `${t('common.confirmRestoreContent')} "${project.name}" ?`
        : `${t('common.confirmArchiveContent')} "${project.name}" ?`,
      onOk: async () => {
        try {
          await archiveProject(
            project.id,
            newStatus,
            passFullProjectOnArchive ? project : undefined,
          );
          message.success(
            isArchived ? t('common.restoreSuccess') : t('common.archiveSuccess'),
          );

          // 如果归档的是当前选中的项目，清除选中
          if (
            resetSelectionOnDelete &&
            selectedProjectId?.value === project.id
          ) {
            selectedProjectId.value = null;
          }

          await loadData?.();
        } catch (error) {
          console.error('Archive Error:', error);
          message.error(t('common.actionFailed'));
        }
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
        try {
          await deleteProject(project.id);
          message.success(t('common.deleteSuccess'));

          if (
            resetSelectionOnDelete &&
            selectedProjectId?.value === project.id
          ) {
            selectedProjectId.value = null;
          }

          await loadData?.();
        } catch (error) {
          console.error('Delete Project Error:', error);
          message.error(t('common.actionFailed'));
        }
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
        try {
          await deleteItem(item.id, projectId);
          message.success(t('common.deleteSuccess'));
          await loadData?.();
        } catch (error) {
          console.error('Delete Item Error:', error);
          message.error(t('common.actionFailed'));
        }
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
