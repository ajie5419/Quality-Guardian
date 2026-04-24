<script lang="ts" setup>
import type {
  WorkbenchProjectItem,
  WorkbenchTodoItem,
  WorkbenchTrendItem,
} from '@vben/common-ui';

import type { WorkspaceDataResponse } from '#/api/qms/workspace';

import { computed } from 'vue';
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

import { useErrorHandler } from '#/hooks/useErrorHandler';
import { useWorkspaceQuery } from '#/hooks/useQmsQueries';

import { useWorkOrderAggregateDrawer } from '../work-order/composables/useWorkOrderAggregateDrawer';
import WorkOrderAggregateDrawer from './components/WorkOrderAggregateDrawer.vue';

type WorkspaceProjectItem = WorkspaceDataResponse['projectItems'][number];

const userStore = useUserStore();
const router = useRouter();
const { t } = useI18n();
const { handleApiError } = useErrorHandler();

const { data: workspaceData } = useWorkspaceQuery();

const projectItems = computed<WorkspaceProjectItem[]>(
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

function getRequirementSummary(item: WorkbenchProjectItem) {
  const projectItem = item as WorkspaceProjectItem;
  return {
    confirmedRequirements: projectItem.confirmedRequirements ?? 0,
    overdueUnconfirmedRequirements:
      projectItem.overdueUnconfirmedRequirements ?? 0,
    plannedRequirements: projectItem.plannedRequirements ?? 0,
  };
}

const {
  aggregateData,
  aggregateLoading,
  aggregateVisible,
  closeWorkOrderAggregate,
  divisionLabel,
  openWorkOrderAggregate,
  refreshAggregate,
  selectedWorkOrderNumber,
} = useWorkOrderAggregateDrawer(handleApiError, {
  aggregateContext: 'Load Workspace Work Order Aggregate',
  loadDeptContext: 'Load Workspace Departments',
  syncRoute: false,
});

function parseWorkOrderNumber(nav: WorkbenchProjectItem) {
  if (String(nav.url || '').startsWith('/qms/work-order')) {
    return String(nav.title || '').trim();
  }
  return '';
}

function navToWorkOrderPage() {
  if (!selectedWorkOrderNumber.value) return;
  router.push({
    path: '/qms/work-order',
    query: { workOrderNumber: selectedWorkOrderNumber.value },
  });
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

    <div class="mt-5">
      <div class="w-full">
        <WorkbenchProject
          :items="projectItems"
          :title="t('qms.workspace.workOrderList')"
          @click="navTo"
        >
          <template #item-extra="{ item }">
            <div
              class="mt-3 grid grid-cols-3 gap-2 rounded-md border border-gray-200 p-2"
            >
              <div class="text-center">
                <div class="text-[20px] font-bold leading-6 text-blue-600">
                  {{ getRequirementSummary(item).plannedRequirements }}
                </div>
                <div class="text-[12px] text-blue-600">任务</div>
              </div>
              <div class="text-center">
                <div class="text-[20px] font-bold leading-6 text-green-600">
                  {{ getRequirementSummary(item).confirmedRequirements }}
                </div>
                <div class="text-[12px] text-green-600">已完成</div>
              </div>
              <div class="text-center">
                <div class="text-[20px] font-bold leading-6 text-red-600">
                  {{
                    getRequirementSummary(item).overdueUnconfirmedRequirements
                  }}
                </div>
                <div class="text-[12px] text-red-600">超10天</div>
              </div>
            </div>
          </template>
          <template #extra>
            <a
              class="text-sm text-blue-600"
              @click.prevent="router.push('/qms/work-order')"
            >
              查看全部工单
            </a>
          </template>
        </WorkbenchProject>
      </div>

      <div class="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-2">
        <WorkbenchTodo :items="todoItems" title="待处理的工程问题" />
        <WorkbenchTrends
          :items="trendItems"
          :title="t('qms.workspace.latestIssueTrends')"
        />
      </div>
    </div>

    <Spin :spinning="aggregateLoading">
      <WorkOrderAggregateDrawer
        :open="aggregateVisible"
        :loading="aggregateLoading"
        :work-order-number="selectedWorkOrderNumber"
        :aggregate-data="aggregateData"
        :division-label="divisionLabel"
        @close="closeWorkOrderAggregate"
        @go-work-order="navToWorkOrderPage"
        @refresh="refreshAggregate"
      />
    </Spin>
  </div>
</template>
