<script setup lang="ts">
import type { InspectionRequest } from '#/api/qms/inspection-request';

import { computed } from 'vue';

import { formatInspectionStationSelection } from '@qgs/shared';
import { Button, Drawer, Tag } from 'ant-design-vue';

import { useMobileViewport } from '#/hooks/useMobileViewport';

export interface DispatchDetailDrawerProps {
  open: boolean;
  request?: InspectionRequest;
  statusColor: (status: InspectionRequest['status']) => string;
  statusLabel: (status: InspectionRequest['status']) => string;
  inspectionResultColor: (record: InspectionRequest) => string;
  inspectionResultLabel: (record: InspectionRequest) => string;
  inspectionQuantityText: (record: InspectionRequest) => string;
  waitDuration: (record: InspectionRequest) => string;
  executionDurationLabel: (record: InspectionRequest) => string;
  displayExecutionDuration: (record: InspectionRequest) => string;
  formatDateTime: (value?: null | string) => string;
  missingValueClass: (value?: null | string) => string;
  displayDispatcher: (record: InspectionRequest) => string;
  displayInspector: (record: InspectionRequest) => string;
  directClosedClass: (record: InspectionRequest) => string;
  displayDispatchTime: (record: InspectionRequest) => string;
  hasLinkedIssue: (record: InspectionRequest) => boolean;
  issueStatusColor: (status?: null | string) => string;
  issueStatusLabel: (status?: null | string) => string;
}

const props = defineProps<DispatchDetailDrawerProps>();

const emit = defineEmits<{
  openClose: [];
  openInspectionRecord: [record: InspectionRequest];
  'update:open': [value: boolean];
}>();

function handleUpdateOpen(value: boolean) {
  emit('update:open', value);
}

const { isMobile } = useMobileViewport();
const drawerWidth = computed(() =>
  isMobile.value ? '100vw' : 'min(100vw, 620px)',
);

function stationSelectionText(request: InspectionRequest) {
  return formatInspectionStationSelection(request.stationSelection);
}
</script>

<template>
  <Drawer
    :open="props.open"
    title="报检任务详情"
    :width="drawerWidth"
    placement="right"
    :body-style="{ padding: 0 }"
    @update:open="handleUpdateOpen"
  >
    <div v-if="props.request" class="flex min-h-full flex-col bg-gray-50">
      <div class="flex-1 space-y-3 overflow-y-auto p-3 sm:p-4">
        <div class="rounded border border-blue-100 bg-white p-3">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="truncate text-base font-semibold text-gray-900">
                {{ props.request.requestNo }}
              </div>
              <div class="mt-1 break-words text-sm text-gray-600">
                {{ props.request.partName }}
                <template v-if="props.request.componentName">
                  / {{ props.request.componentName }}
                </template>
                / {{ props.request.processName }}
              </div>
            </div>
            <div class="flex shrink-0 flex-wrap justify-end gap-1">
              <Tag :color="props.statusColor(props.request.status)">
                {{ props.statusLabel(props.request.status) }}
              </Tag>
              <Tag
                v-if="
                  props.request.status === 'CLOSED' ||
                  props.request.inspectionResult === 'FAIL'
                "
                :color="props.inspectionResultColor(props.request)"
              >
                {{ props.inspectionResultLabel(props.request) }}
              </Tag>
            </div>
          </div>
          <div class="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            <div class="rounded bg-gray-50 px-2 py-2">
              <div class="text-gray-500">数量</div>
              <div class="mt-1 font-semibold text-gray-900">
                {{ props.request.quantity || 1 }}
              </div>
            </div>
            <div
              v-if="stationSelectionText(props.request)"
              class="rounded bg-gray-50 px-2 py-2"
            >
              <div class="text-gray-500">台数</div>
              <div class="mt-1 font-semibold text-gray-900">
                {{ stationSelectionText(props.request) }}
              </div>
            </div>
            <div class="rounded bg-gray-50 px-2 py-2">
              <div class="text-gray-500">班组</div>
              <div class="mt-1 truncate font-semibold text-gray-900">
                {{ props.request.team || '-' }}
              </div>
            </div>
            <div class="rounded bg-gray-50 px-2 py-2">
              <div class="text-gray-500">等待</div>
              <div class="mt-1 font-semibold text-gray-900">
                {{ props.waitDuration(props.request) }}
              </div>
            </div>
            <div class="rounded bg-gray-50 px-2 py-2">
              <div class="text-gray-500">
                {{ props.executionDurationLabel(props.request) }}
              </div>
              <div class="mt-1 font-semibold text-gray-900">
                {{ props.displayExecutionDuration(props.request) }}
              </div>
            </div>
            <div
              v-if="
                props.request.status === 'CLOSED' ||
                props.request.inspectionResult === 'FAIL'
              "
              class="rounded bg-gray-50 px-2 py-2"
            >
              <div class="text-gray-500">检验结果</div>
              <div
                class="mt-1 font-semibold"
                :class="
                  props.request.inspectionResult === 'FAIL'
                    ? 'text-red-600'
                    : 'text-green-600'
                "
              >
                {{ props.inspectionResultLabel(props.request) }}
              </div>
            </div>
            <div
              v-if="
                props.request.status === 'CLOSED' ||
                props.request.inspectionResult === 'FAIL'
              "
              class="rounded bg-gray-50 px-2 py-2"
            >
              <div class="text-gray-500">检验数量</div>
              <div class="mt-1 font-semibold text-gray-900">
                {{ props.inspectionQuantityText(props.request) }}
              </div>
            </div>
          </div>
        </div>

        <div class="rounded border border-gray-100 bg-white p-3">
          <div class="mb-2 text-sm font-medium text-gray-900">报检信息</div>
          <div class="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <div class="text-xs text-gray-500">工单号</div>
              <div class="mt-0.5 break-words text-gray-900">
                {{ props.request.workOrderNumber }}
              </div>
            </div>
            <div>
              <div class="text-xs text-gray-500">报检人</div>
              <div class="mt-0.5 break-words text-gray-900">
                {{ props.request.reporter || '-' }}
              </div>
            </div>
            <div class="sm:col-span-2">
              <div class="text-xs text-gray-500">报检时间</div>
              <div class="mt-0.5 text-gray-900">
                {{ props.formatDateTime(props.request.submittedAt) }}
              </div>
            </div>
          </div>
        </div>

        <div class="rounded border border-gray-100 bg-white p-3">
          <div class="mb-2 text-sm font-medium text-gray-900">执行信息</div>
          <div class="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <div class="text-xs text-gray-500">调度人</div>
              <div
                class="mt-0.5 break-words text-gray-900"
                :class="props.missingValueClass(props.request.dispatcherName)"
              >
                {{ props.displayDispatcher(props.request) }}
              </div>
            </div>
            <div>
              <div class="text-xs text-gray-500">检验员</div>
              <div
                class="mt-0.5 break-words text-gray-900"
                :class="props.missingValueClass(props.request.inspectorName)"
              >
                {{ props.displayInspector(props.request) }}
              </div>
            </div>
            <div>
              <div class="text-xs text-gray-500">派单任务 ID</div>
              <div
                class="mt-0.5 break-all text-gray-900"
                :class="props.missingValueClass(props.request.dispatchTaskId)"
              >
                {{ props.request.dispatchTaskId || '-' }}
              </div>
            </div>
            <div>
              <div class="text-xs text-gray-500">派单时间</div>
              <div
                class="mt-0.5 text-gray-900"
                :class="props.directClosedClass(props.request)"
              >
                {{ props.displayDispatchTime(props.request) }}
              </div>
            </div>
            <div class="sm:col-span-2">
              <div class="text-xs text-gray-500">派单备注</div>
              <div class="mt-0.5 whitespace-pre-wrap break-words text-gray-900">
                {{ props.request.dispatchRemark || '-' }}
              </div>
            </div>
          </div>
        </div>

        <div class="rounded border border-gray-100 bg-white p-3">
          <div class="mb-2 text-sm font-medium text-gray-900">检验资料</div>
          <div class="space-y-3 text-sm">
            <div>
              <div class="mb-1 text-xs text-gray-500">关联检验记录</div>
              <Button
                v-if="props.request.inspectionId"
                type="link"
                class="h-auto p-0"
                @click="emit('openInspectionRecord', props.request)"
              >
                查看检验记录
              </Button>
              <span v-else class="text-gray-400">-</span>
            </div>
            <div v-if="props.hasLinkedIssue(props.request)">
              <div class="mb-1 text-xs text-gray-500">关联不合格项</div>
              <div class="flex flex-wrap items-center gap-2">
                <Tag :color="props.inspectionResultColor(props.request)">
                  {{ props.request.linkedIssueNo || '已生成不合格项' }}
                </Tag>
                <Tag
                  :color="
                    props.issueStatusColor(props.request.linkedIssueStatus)
                  "
                >
                  {{ props.issueStatusLabel(props.request.linkedIssueStatus) }}
                </Tag>
              </div>
            </div>
            <div>
              <div class="mb-1 text-xs text-gray-500">自检记录</div>
              <div
                v-if="props.request.attachments?.length"
                class="flex flex-col gap-1"
              >
                <a
                  v-for="file in props.request.attachments"
                  :key="file.url"
                  :href="file.url"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="break-all"
                >
                  {{ file.name }}
                </a>
              </div>
              <span v-else class="text-gray-400">-</span>
            </div>
            <div>
              <div class="mb-1 text-xs text-gray-500">检验记录</div>
              <div
                v-if="props.request.closeAttachments?.length"
                class="flex flex-col gap-1"
              >
                <a
                  v-for="file in props.request.closeAttachments"
                  :key="file.url"
                  :href="file.url"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="break-all"
                >
                  {{ file.name }}
                </a>
              </div>
              <span v-else class="text-gray-400">-</span>
            </div>
          </div>
        </div>
      </div>

      <div class="border-t border-gray-100 bg-white p-3 sm:p-4">
        <Button
          type="primary"
          class="w-full sm:w-auto"
          size="large"
          :disabled="props.request.status === 'CLOSED'"
          @click="emit('openClose')"
        >
          完成检验
        </Button>
      </div>
    </div>
  </Drawer>
</template>
