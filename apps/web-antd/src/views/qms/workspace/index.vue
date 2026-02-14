<script lang="ts" setup>
import type { CheckboxChangeEvent } from 'ant-design-vue/es/checkbox/interface';

import type {
  WorkbenchProjectItem,
  WorkbenchQuickNavItem,
  WorkbenchTodoItem,
  WorkbenchTrendItem,
} from '@vben/common-ui';

import type { QmsPlanningApi } from '#/api/qms/planning';
import type { QmsTaskDispatchApi } from '#/api/qms/task-dispatch';
import type { SystemUserApi } from '#/api/system/user';

import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';

import {
  WorkbenchHeader,
  WorkbenchProject,
  WorkbenchQuickNav,
  WorkbenchTodo,
  WorkbenchTrends,
} from '@vben/common-ui';
import { useI18n } from '@vben/locales';
import { preferences } from '@vben/preferences';
import { useUserStore } from '@vben/stores';
import { openWindow } from '@vben/utils';

import {
  Button,
  Card,
  Checkbox,
  Col,
  Empty,
  List,
  message,
  Modal,
  Progress,
  Row,
  Select,
  SelectOption,
  Statistic,
  Tag,
} from 'ant-design-vue';

import { getDfmeaItemsByProject, getItpList } from '#/api/qms/planning';
import {
  createTask,
  getTaskList,
  getTaskStats,
  updateTaskStatus,
} from '#/api/qms/task-dispatch';
import { getUserList } from '#/api/system/user';
import { useErrorHandler } from '#/hooks/useErrorHandler';
import { useWorkspaceQuery } from '#/hooks/useQmsQueries';

const userStore = useUserStore();
const router = useRouter();
const { t } = useI18n();
const { handleApiError } = useErrorHandler();

// 获取当前用户 ID 的统一计算属性
const currentUserId = computed(() => {
  const info = userStore.userInfo;
  const id = info?.id ?? (info as Record<string, any>)?.userId;
  return id === undefined ? '' : String(id);
});

// 任务统计数据
const taskStats = ref({
  pendingLevel1: 0,
  pendingLevel2: 0,
  processing: 0,
  overdue: 0,
});

const myTasks = ref<QmsTaskDispatchApi.TaskDispatch[]>([]);

// 解决模板中无法访问 Empty.PRESENTED_IMAGE_SIMPLE 的问题
const EMPTY_IMAGE = Empty.PRESENTED_IMAGE_SIMPLE;

async function loadTaskData() {
  try {
    const isAdmin =
      userStore.userInfo?.roles?.includes('super') ||
      userStore.userInfo?.roles?.includes('admin');
    const [stats, list] = await Promise.all([
      getTaskStats(),
      // 关键：查询包含 PENDING 和 DISPATCHED 状态的任务，支持连续指派
      getTaskList({
        status: 'PENDING,DISPATCHED',
        all: isAdmin ? 'true' : 'false',
      }),
    ]);
    taskStats.value = stats;
    myTasks.value = list;
  } catch (error) {
    console.error('Failed to load task data', error);
  }
}

// 二级分派 Modal 逻辑
const isDispatchModalVisible = ref(false);
const currentTask = ref<null | QmsTaskDispatchApi.TaskDispatch>(null);
const userList = ref<SystemUserApi.User[]>([]);
const businessItems = ref<{ id: string; label: string }[]>([]);
const isItemsLoading = ref(false);

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
    // 1. 获取业务全量条目
    let allBusinessData: (QmsPlanningApi.DfmeaItem | QmsPlanningApi.ItpItem)[] =
      [];
    if (task.type === 'ITP_INSPECTION' && task.itpProjectId) {
      allBusinessData = await getItpList({ projectId: task.itpProjectId });
    } else if (task.type === 'DFMEA_ACTION' && task.dfmeaId) {
      allBusinessData = (await getDfmeaItemsByProject(
        task.dfmeaId,
      )) as QmsPlanningApi.DfmeaItem[];
    }

    // 2. 获取已经派发出去的二级任务
    const dispatchedSubTasks = await getTaskList({
      parentId: task.id,
      level: 2,
    });

    // 提取已经派发的条目 ID 或 Label (由于 content 存储的是 label，我们这里用 label 进行过滤)
    const dispatchedItemLabels = new Set<string>();
    dispatchedSubTasks.forEach((st) => {
      if (st.content?.items && Array.isArray(st.content.items)) {
        st.content.items.forEach((label: string) =>
          dispatchedItemLabels.add(label),
        );
      }
    });

    // 3. 过滤掉已派发的条目
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
    console.error('Load and filter business items failed', error);
  } finally {
    isItemsLoading.value = false;
  }
}

const dispatchForm = ref({
  assigneeId: '',
  selectedItems: [] as string[],
});

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

    // 检查是否所有条目均已分派完成
    const isAllDispatched =
      businessItems.value.length === dispatchForm.value.selectedItems.length;
    if (isAllDispatched) {
      await updateTaskStatus(task.id, 'COMPLETED');
      message.success(t('qms.workspace.allDispatched'));
    } else {
      message.success(t('qms.workspace.secondaryDispatchSuccess'));
    }

    isDispatchModalVisible.value = false;
    loadTaskData();
  } catch (error) {
    handleApiError(error, 'Secondary Dispatch');
  }
}

onMounted(() => {
  loadTaskData();
});

// 使用 vue-query 缓存查询
const { data: workspaceData } = useWorkspaceQuery();

// 计算属性从缓存数据中提取
const projectItems = computed<WorkbenchProjectItem[]>(
  () => workspaceData.value?.projectItems || [],
);
const todoItems = computed<WorkbenchTodoItem[]>(
  () => workspaceData.value?.todoItems || [],
);
const trendItems = computed<WorkbenchTrendItem[]>(
  () => workspaceData.value?.trendItems || [],
);
const stats = computed(
  () =>
    workspaceData.value?.stats || {
      todayWorkOrders: 0,
      todayInspections: 0,
      todayIssues: 0,
      openIssuesCount: 0,
    },
);

// QMS 快捷导航
const quickNavItems: WorkbenchQuickNavItem[] = [
  {
    color: '#1890ff',
    icon: 'lucide:layout-dashboard',
    title: t('qms.dashboard.title'),
    url: '/qms/dashboard',
  },
  {
    color: '#52c41a',
    icon: 'lucide:clipboard-list',
    title: t('qms.workOrder.title'),
    url: '/qms/work-order',
  },
  {
    color: '#faad14',
    icon: 'lucide:alert-triangle',
    title: t('qms.inspection.issues.title'),
    url: '/qms/inspection/issues',
  },
  {
    color: '#eb2f96',
    icon: 'lucide:file-check',
    title: t('qms.inspection.records.title'),
    url: '/qms/inspection/records',
  },
  {
    color: '#722ed1',
    icon: 'lucide:phone-call',
    title: t('qms.afterSales.title'),
    url: '/qms/after-sales',
  },
  {
    color: '#fa8c16',
    icon: 'lucide:book-open',
    title: t('qms.knowledge.title'),
    url: '/qms/knowledge',
  },
  {
    color: '#13c2c2',
    icon: 'lucide:file-bar-chart',
    title: t('qms.reports.daily.title'),
    url: '/qms/reports',
  },
];

function navTo(nav: WorkbenchProjectItem | WorkbenchQuickNavItem) {
  if (nav.url?.startsWith('http')) {
    openWindow(nav.url);
    return;
  }
  if (nav.url?.startsWith('/')) {
    router.push(nav.url).catch((error) => {
      console.error('Navigation failed:', error);
    });
  }
}

// 任务状态映射
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

// 任务详情弹窗状态
const isTaskDetailVisible = ref(false);
const taskDetailContent = ref<string[]>([]);

function handleViewDetails(task: QmsTaskDispatchApi.TaskDispatch) {
  taskDetailContent.value =
    (task.content as any)?.items || task.content?.requirements || [];
  isTaskDetailVisible.value = true;
}

function handleGoToFill(task: QmsTaskDispatchApi.TaskDispatch) {
  if (task.type === 'ITP_INSPECTION') {
    router.push({
      path: '/qms/inspection/records',
      query: {
        taskId: task.id,
        itpProjectId: task.itpProjectId,
      },
    });
  } else if (task.type === 'DFMEA_ACTION') {
    // 跳转到 DFMEA 规划页面进行改进措施反馈
    router.push('/qms/planning/dfmea');
  }
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 6) return t('common.greeting.earlyMorning');
  if (hour < 9) return t('common.greeting.morning');
  if (hour < 12) return t('common.greeting.forenoon');
  if (hour < 14) return t('common.greeting.noon');
  if (hour < 18) return t('common.greeting.afternoon');
  if (hour < 22) return t('common.greeting.evening');
  return t('common.greeting.lateNight');
}
</script>

<template>
  <div class="p-5">
    <WorkbenchHeader
      :avatar="userStore.userInfo?.avatar || preferences.app.defaultAvatar"
    >
      <template #title>
        {{ getGreeting() }},
        {{
          t('qms.workspace.startWork', {
            user: userStore.userInfo?.realName || t('common.user'),
          })
        }}
      </template>
      <template #description>
        <span class="mr-4"
          >📋 {{ t('qms.workspace.todayWorkOrders') }}:
          <strong>{{ stats.todayWorkOrders }}</strong></span
        >
        <span class="mr-4"
          >🔍 {{ t('qms.workspace.todayInspections') }}:
          <strong>{{ stats.todayInspections }}</strong></span
        >
        <span class="mr-4"
          >⚠️ {{ t('qms.workspace.openIssues') }}:
          <strong class="text-red-500">{{
            stats.openIssuesCount
          }}</strong></span
        >
      </template>
    </WorkbenchHeader>

    <!-- 任务统计看板 -->
    <Row :gutter="16" class="mt-5">
      <Col :span="6">
        <Card size="small" class="shadow-sm">
          <Statistic
            :title="t('qms.workspace.taskStats.pendingLevel1')"
            :value="taskStats.pendingLevel1"
            :value-style="{ color: '#cf1322' }"
          />
        </Card>
      </Col>
      <Col :span="6">
        <Card size="small" class="shadow-sm">
          <Statistic
            :title="t('qms.workspace.taskStats.pendingLevel2')"
            :value="taskStats.pendingLevel2"
            :value-style="{ color: '#faad14' }"
          />
        </Card>
      </Col>
      <Col :span="6">
        <Card size="small" class="shadow-sm">
          <Statistic
            :title="t('qms.workspace.taskStats.processingTasks')"
            :value="taskStats.processing"
            :value-style="{ color: '#3f8600' }"
          />
        </Card>
      </Col>
      <Col :span="6">
        <Card size="small" class="bg-blue-50/30 shadow-sm">
          <div class="flex h-[56px] items-center justify-between px-2">
            <div class="text-gray-500">
              {{ t('qms.workspace.taskStats.closureRate') }}
            </div>
            <Progress
              type="circle"
              :percent="85"
              :size="40"
              stroke-color="#1890ff"
            />
          </div>
        </Card>
      </Col>
    </Row>

    <div class="mt-5 flex flex-col lg:flex-row">
      <div class="mr-4 w-full lg:w-3/5">
        <!-- 待我派发的任务列表 -->
        <Card
          :title="t('qms.workspace.taskWorkbench')"
          size="small"
          class="mb-5 shadow-sm"
        >
          <template #extra>
            <Button type="link" size="small" @click="loadTaskData">{{
              t('common.refresh')
            }}</Button>
          </template>
          <List :data-source="myTasks" size="small">
            <template #renderItem="{ item }">
              <List.Item>
                <div class="flex w-full items-center justify-between">
                  <div class="flex items-center gap-3">
                    <Tag
                      :color="
                        item.type === 'ITP_INSPECTION' ? 'blue' : 'purple'
                      "
                    >
                      {{ item.type === 'ITP_INSPECTION' ? 'ITP' : 'DFMEA' }}
                    </Tag>
                    <span class="font-medium">{{ item.title }}</span>
                  </div>
                  <div class="flex items-center gap-4">
                    <!-- 状态展示 -->
                    <Tag :color="getStatusColor(item.status)">
                      {{ getStatusLabel(item.status) }}
                    </Tag>

                    <span class="text-xs">
                      <Tag
                        v-if="String(item.assigneeId) === currentUserId"
                        color="blue"
                        >{{ t('qms.workspace.myTask') }}</Tag
                      >
                      <span v-else class="text-gray-400"
                        >{{ t('common.responsible') }}:
                        {{ item.assigneeName || t('common.notSet') }}</span
                      >
                    </span>

                    <!-- 动作按钮：仅当当前用户是执行人时显示 -->
                    <template v-if="String(item.assigneeId) === currentUserId">
                      <Button
                        v-if="item.level === 1"
                        type="primary"
                        size="small"
                        ghost
                        @click="handleOpenDispatch(item)"
                      >
                        {{ t('qms.workspace.deconstruct') }}
                      </Button>
                      <Button
                        v-else-if="item.level === 2"
                        type="primary"
                        size="small"
                        ghost
                        @click="handleGoToFill(item)"
                      >
                        {{ t('qms.workspace.goToFill') }}
                      </Button>
                      <Button
                        type="link"
                        size="small"
                        @click="handleViewDetails(item)"
                      >
                        {{ t('common.detail') }}
                      </Button>
                    </template>
                    <!-- 非执行人也能看详情 -->
                    <template v-else>
                      <Button
                        type="link"
                        size="small"
                        @click="handleViewDetails(item)"
                      >
                        {{ t('common.detail') }}
                      </Button>
                    </template>
                  </div>
                </div>
              </List.Item>
            </template>
            <template #footer v-if="myTasks.length === 0">
              <div class="py-10 text-center">
                <Empty
                  :description="t('qms.workspace.unassigned')"
                  :image="EMPTY_IMAGE"
                />
                <div class="mt-2 text-[10px] text-gray-300">
                  用户 ID: {{ userStore.userInfo?.id || t('common.unknown') }}
                </div>
              </div>
            </template>
          </List>
        </Card>

        <WorkbenchProject
          :items="projectItems"
          :title="t('qms.workspace.workOrderList')"
          @click="navTo"
        />
        <WorkbenchTrends
          :items="trendItems"
          class="mt-5"
          :title="t('qms.workspace.latestIssueTrends')"
        />
      </div>
      <div class="w-full lg:w-2/5">
        <WorkbenchQuickNav
          :items="quickNavItems"
          class="mt-5 lg:mt-0"
          :title="t('common.quickNav')"
          @click="navTo"
        />
        <WorkbenchTodo
          :items="todoItems"
          class="mt-5"
          title="待处理的工程问题"
        />
      </div>
    </div>

    <!-- 二级分派弹窗 -->
    <Modal
      v-model:open="isDispatchModalVisible"
      :title="`任务二级分办: ${currentTask?.title}`"
      width="700px"
      @ok="submitSecondaryDispatch"
    >
      <div class="space-y-4 py-4">
        <div
          class="flex items-start gap-2 rounded bg-blue-50 p-3 text-xs text-blue-700"
        >
          <span class="i-lucide-info mt-0.5 text-sm"></span>
          <div>
            二级分办说明：您可以将本任务拆解为具体的检验项或措施，并指派给团队成员。
          </div>
        </div>

        <div>
          <label class="mb-1 block text-sm font-medium">选择执行人</label>
          <Select
            v-model:value="dispatchForm.assigneeId"
            class="w-full"
            placeholder="请选择组员"
          >
            <SelectOption
              v-for="user in userList"
              :key="user.id"
              :value="user.id"
            >
              {{ user.realName || user.username }}
            </SelectOption>
          </Select>
        </div>

        <div>
          <label class="mb-1 block text-sm font-medium"
            >勾选指派内容 ({{
              currentTask?.type === 'ITP_INSPECTION'
                ? 'ITP 控制点'
                : 'DFMEA 建议措施'
            }})</label
          >
          <div class="max-h-[300px] overflow-y-auto rounded border p-2">
            <div v-if="isItemsLoading" class="p-8 text-center text-gray-400">
              数据加载中...
            </div>
            <div v-else-if="businessItems.length > 0" class="space-y-1">
              <div
                v-for="item in businessItems"
                :key="item.id"
                class="flex items-center gap-2 rounded p-2 hover:bg-gray-50"
              >
                <Checkbox
                  :checked="dispatchForm.selectedItems.includes(item.label)"
                  @change="
                    (e: CheckboxChangeEvent) =>
                      e.target.checked
                        ? dispatchForm.selectedItems.push(item.label)
                        : (dispatchForm.selectedItems =
                            dispatchForm.selectedItems.filter(
                              (i) => i !== item.label,
                            ))
                  "
                >
                  {{ item.label }}
                </Checkbox>
              </div>
            </div>
            <div v-else class="p-8 text-center text-gray-400">
              未查找到相关条目
            </div>
          </div>
        </div>
      </div>
    </Modal>

    <!-- 任务内容详情弹窗 -->
    <Modal
      v-model:open="isTaskDetailVisible"
      :title="t('qms.task.detail.content')"
      :footer="null"
    >
      <div class="py-4">
        <List size="small" bordered :data-source="taskDetailContent">
          <template #renderItem="{ item }">
            <List.Item>{{ item }}</List.Item>
          </template>
          <template #header>
            <div class="font-medium text-gray-500">
              {{ t('qms.task.detail.items') }}
            </div>
          </template>
        </List>
        <div
          v-if="taskDetailContent.length === 0"
          class="py-4 text-center text-gray-400"
        >
          {{ t('common.noData') }}
        </div>
      </div>
    </Modal>
  </div>
</template>
