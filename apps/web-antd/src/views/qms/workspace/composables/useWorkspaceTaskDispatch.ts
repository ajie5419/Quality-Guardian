import type { QmsPlanningApi } from '#/api/qms/planning';
import type { QmsTaskDispatchApi } from '#/api/qms/task-dispatch';
import type { SystemUserApi } from '#/api/system/user';

import { computed, ref } from 'vue';

import { message } from 'ant-design-vue';

import { getDfmeaItemsByProject, getItpList } from '#/api/qms/planning';
import {
  createTask,
  getTaskList,
  getTaskStats,
  updateTaskStatus,
} from '#/api/qms/task-dispatch';
import { getUserList } from '#/api/system/user';

type TranslateFn = (key: string) => string;

interface UseWorkspaceTaskDispatchOptions {
  handleApiError: (error: unknown, context?: string) => void;
  onTaskDispatched?: () => void;
  t: TranslateFn;
  userRoles?: string[];
}

export function useWorkspaceTaskDispatch(
  options: UseWorkspaceTaskDispatchOptions,
) {
  const { t, userRoles = [], handleApiError, onTaskDispatched } = options;

  const taskStats = ref({
    pendingLevel1: 0,
    pendingLevel2: 0,
    processing: 0,
    overdue: 0,
  });
  const myTasks = ref<QmsTaskDispatchApi.TaskDispatch[]>([]);

  const isDispatchModalVisible = ref(false);
  const currentTask = ref<null | QmsTaskDispatchApi.TaskDispatch>(null);
  const userList = ref<SystemUserApi.User[]>([]);
  const businessItems = ref<{ id: string; label: string }[]>([]);
  const isItemsLoading = ref(false);
  const dispatchForm = ref({
    assigneeId: '',
    selectedItems: [] as string[],
  });

  const statusMap = computed<Record<string, { color: string; label: string }>>(
    () => ({
      PENDING: { label: t('qms.task.status.pending'), color: 'default' },
      DISPATCHED: { label: t('qms.task.status.dispatched'), color: 'blue' },
      PROCESSING: { label: t('qms.task.status.processing'), color: 'orange' },
      COMPLETED: { label: t('qms.task.status.completed'), color: 'green' },
      OVERDUE: { label: t('qms.task.status.overdue'), color: 'red' },
    }),
  );

  function getStatusLabel(status: string) {
    return statusMap.value[status]?.label || status;
  }

  function getStatusColor(status: string) {
    return statusMap.value[status]?.color || 'default';
  }

  async function loadTaskData() {
    try {
      const isAdmin =
        userRoles.includes('super') || userRoles.includes('admin');
      const [stats, list] = await Promise.all([
        getTaskStats(),
        getTaskList({
          status: 'PENDING,DISPATCHED',
          all: isAdmin ? 'true' : 'false',
        }),
      ]);
      taskStats.value = stats;
      myTasks.value = list;
    } catch (error) {
      handleApiError(error, 'Load Workspace Task Data');
    }
  }

  async function loadUsers() {
    try {
      const res = await getUserList();
      userList.value = res.items || (res as unknown as SystemUserApi.User[]);
    } catch {}
  }

  async function loadBusinessItems(task: QmsTaskDispatchApi.TaskDispatch) {
    isItemsLoading.value = true;
    businessItems.value = [];
    try {
      let allBusinessData:
        | (QmsPlanningApi.DfmeaItem | QmsPlanningApi.ItpItem)[]
        | [] = [];
      if (task.type === 'ITP_INSPECTION' && task.itpProjectId) {
        allBusinessData = await getItpList({ projectId: task.itpProjectId });
      } else if (task.type === 'DFMEA_ACTION' && task.dfmeaId) {
        allBusinessData = (await getDfmeaItemsByProject(
          task.dfmeaId,
        )) as QmsPlanningApi.DfmeaItem[];
      }

      const dispatchedSubTasks = await getTaskList({
        parentId: task.id,
        level: 2,
      });
      const dispatchedItemLabels = new Set<string>();
      dispatchedSubTasks.forEach((st) => {
        if (st.content?.items && Array.isArray(st.content.items)) {
          st.content.items.forEach((label: string) =>
            dispatchedItemLabels.add(label),
          );
        }
      });

      businessItems.value =
        task.type === 'ITP_INSPECTION'
          ? (allBusinessData as QmsPlanningApi.ItpItem[])
              .map((item) => ({
                id: item.id,
                label: `${item.processStep} - ${item.activity}`,
              }))
              .filter((item) => !dispatchedItemLabels.has(item.label))
          : (allBusinessData as QmsPlanningApi.DfmeaItem[])
              .map((item) => ({
                id: item.id,
                label: `${item.item}: ${item.failureMode}`,
              }))
              .filter((item) => !dispatchedItemLabels.has(item.label));
    } catch (error) {
      handleApiError(error, 'Load Workspace Business Items');
    } finally {
      isItemsLoading.value = false;
    }
  }

  function handleOpenDispatch(task: QmsTaskDispatchApi.TaskDispatch) {
    currentTask.value = task;
    dispatchForm.value = { assigneeId: '', selectedItems: [] };
    isDispatchModalVisible.value = true;
    loadUsers();
    loadBusinessItems(task);
  }

  async function submitSecondaryDispatch() {
    const task = currentTask.value;
    if (!task) return;

    if (
      !dispatchForm.value.assigneeId ||
      dispatchForm.value.selectedItems.length === 0
    ) {
      message.warning(t('common.pleaseCompleteInfo'));
      return;
    }

    try {
      await createTask({
        type: task.type,
        title: `[${t('common.dispatch')}] ${task.title}`,
        level: 2,
        parentId: task.id,
        itpProjectId: task.itpProjectId,
        dfmeaId: task.dfmeaId,
        assigneeId: dispatchForm.value.assigneeId,
        content: { items: dispatchForm.value.selectedItems },
      });

      const isAllDispatched =
        businessItems.value.length === dispatchForm.value.selectedItems.length;
      if (isAllDispatched) {
        await updateTaskStatus(task.id, 'COMPLETED');
        message.success(t('qms.workspace.allDispatched'));
      } else {
        message.success(t('qms.workspace.secondaryDispatchSuccess'));
      }

      isDispatchModalVisible.value = false;
      await loadTaskData();
      onTaskDispatched?.();
    } catch (error) {
      handleApiError(error, 'Secondary Dispatch');
    }
  }

  return {
    taskStats,
    myTasks,
    isDispatchModalVisible,
    currentTask,
    userList,
    businessItems,
    isItemsLoading,
    dispatchForm,
    loadTaskData,
    handleOpenDispatch,
    submitSecondaryDispatch,
    getStatusLabel,
    getStatusColor,
  };
}
