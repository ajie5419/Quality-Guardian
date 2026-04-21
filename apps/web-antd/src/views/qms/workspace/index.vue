<script lang="ts" setup>
import type {
  WorkbenchProjectItem,
  WorkbenchTodoItem,
  WorkbenchTrendItem,
} from '@vben/common-ui';

import type { WorkspaceWorkOrderAggregateResponse } from '#/api/qms/workspace';
import type { SystemDeptApi } from '#/api/system/dept';

import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';

import {
  WorkbenchHeader,
  WorkbenchProject,
  WorkbenchTodo,
  WorkbenchTrends,
} from '@vben/common-ui';
import { useI18n } from '@vben/locales';
import { preferences } from '@vben/preferences';
import { useUserStore } from '@vben/stores';
import { openWindow } from '@vben/utils';

import { Spin } from 'ant-design-vue';

import { getWorkspaceWorkOrderAggregate } from '#/api/qms/workspace';
import { getDeptList } from '#/api/system/dept';
import { useErrorHandler } from '#/hooks/useErrorHandler';
import { useWorkspaceQuery } from '#/hooks/useQmsQueries';
import { findNameById } from '#/types';

import WorkOrderAggregateDrawer from './components/WorkOrderAggregateDrawer.vue';

const userStore = useUserStore();
const router = useRouter();
const { t } = useI18n();
const { handleApiError } = useErrorHandler();

const { data: workspaceData } = useWorkspaceQuery();

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

const aggregateVisible = ref(false);
const aggregateLoading = ref(false);
const selectedWorkOrderNumber = ref('');
const aggregateData = ref<null | WorkspaceWorkOrderAggregateResponse>(null);
const deptRawData = ref<SystemDeptApi.Dept[]>([]);

function parseWorkOrderNumber(nav: WorkbenchProjectItem) {
  if (String(nav.url || '').startsWith('/qms/work-order')) {
    return String(nav.title || '').trim();
  }
  return '';
}

async function ensureDepartmentsLoaded() {
  if (deptRawData.value.length > 0) return;
  try {
    deptRawData.value = await getDeptList();
  } catch (error) {
    handleApiError(error, 'Load Workspace Departments');
  }
}

async function openWorkOrderAggregate(workOrderNumber: string) {
  await ensureDepartmentsLoaded();
  aggregateLoading.value = true;
  aggregateVisible.value = true;
  selectedWorkOrderNumber.value = workOrderNumber;
  try {
    aggregateData.value = await getWorkspaceWorkOrderAggregate({
      workOrderNumber,
    });
  } catch (error) {
    aggregateVisible.value = false;
    aggregateData.value = null;
    handleApiError(error, 'Load Workspace Work Order Aggregate');
  } finally {
    aggregateLoading.value = false;
  }
}

function getDivisionLabel(value?: string) {
  const idOrName = String(value || '').trim();
  if (!idOrName) return '-';
  return findNameById(deptRawData.value, idOrName) || idOrName;
}

function navToWorkOrderPage() {
  if (!selectedWorkOrderNumber.value) return;
  router.push({
    path: '/qms/work-order',
    query: { workOrderNumber: selectedWorkOrderNumber.value },
  });
}

async function refreshAggregate() {
  if (!selectedWorkOrderNumber.value) return;
  await openWorkOrderAggregate(selectedWorkOrderNumber.value);
}

async function navTo(nav: WorkbenchProjectItem) {
  const workOrderNumber = parseWorkOrderNumber(nav);
  if (workOrderNumber) {
    await openWorkOrderAggregate(workOrderNumber);
    return;
  }
  if (nav.url?.startsWith('http')) {
    openWindow(nav.url);
    return;
  }
  if (nav.url?.startsWith('/')) {
    router.push(nav.url).catch((error) => {
      handleApiError(error, 'Workspace Navigation');
    });
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

    <div class="mt-5 flex flex-col lg:flex-row">
      <div class="mr-4 w-full lg:w-3/5">
        <WorkbenchProject
          :items="projectItems"
          :title="t('qms.workspace.workOrderList')"
          @click="navTo"
        >
          <template #extra>
            <a
              class="text-sm text-blue-600"
              @click.prevent="router.push('/qms/work-order')"
            >
              查看全部工单
            </a>
          </template>
        </WorkbenchProject>
        <WorkbenchTrends
          :items="trendItems"
          class="mt-5"
          :title="t('qms.workspace.latestIssueTrends')"
        />
      </div>
      <div class="w-full lg:w-2/5">
        <WorkbenchTodo
          :items="todoItems"
          class="mt-5 lg:mt-0"
          title="待处理的工程问题"
        />
      </div>
    </div>

    <Spin :spinning="aggregateLoading">
      <WorkOrderAggregateDrawer
        :open="aggregateVisible"
        :loading="aggregateLoading"
        :work-order-number="selectedWorkOrderNumber"
        :aggregate-data="aggregateData"
        :division-label="getDivisionLabel(aggregateData?.workOrder.division)"
        @close="aggregateVisible = false"
        @go-work-order="navToWorkOrderPage"
        @refresh="refreshAggregate"
      />
    </Spin>
  </div>
</template>
