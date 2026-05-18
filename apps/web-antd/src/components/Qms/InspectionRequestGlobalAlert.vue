<script lang="ts" setup>
import type { InspectionRequest } from '#/api/qms/inspection-request';

import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';

import { IconifyIcon } from '@vben/icons';
import { useAccessStore, useUserStore } from '@vben/stores';

import { Button, Modal, Tag } from 'ant-design-vue';
import dayjs from 'dayjs';

import { getInspectionRequests } from '#/api/qms/inspection-request';

const ALERT_LOOKBACK_HOURS = 12;
const POLL_INTERVAL_MS = 60_000;
const STORAGE_PREFIX = 'qms:inspection-request-alert:read';

const router = useRouter();
const accessStore = useAccessStore();
const userStore = useUserStore();
const open = ref(false);
const loading = ref(false);
const activeRequest = ref<InspectionRequest>();
const pendingRequests = ref<InspectionRequest[]>([]);
let timer: number | undefined;
let eventSource: EventSource | undefined;

const storageKey = computed(
  () =>
    `${STORAGE_PREFIX}:${userStore.userInfo?.userId || userStore.userInfo?.username || 'default'}`,
);

const taskTitle = computed(() => {
  if (!activeRequest.value) return '新报检任务';
  return [
    activeRequest.value.partName,
    activeRequest.value.componentName,
    activeRequest.value.processName,
  ]
    .filter(Boolean)
    .join(' / ');
});

function readAcknowledgedIds() {
  try {
    const raw = window.localStorage.getItem(storageKey.value);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(
      Array.isArray(parsed)
        ? parsed.filter((item): item is string => typeof item === 'string')
        : [],
    );
  } catch {
    return new Set<string>();
  }
}

function saveAcknowledgedIds(ids: Set<string>) {
  try {
    window.localStorage.setItem(
      storageKey.value,
      JSON.stringify([...ids].slice(-300)),
    );
  } catch {
    // Local storage can be unavailable in restricted browser modes.
  }
}

function isRecentSubmittedRequest(record: InspectionRequest) {
  if (!record.submittedAt) return false;
  return (
    dayjs().diff(dayjs(record.submittedAt), 'hour', true) <=
    ALERT_LOOKBACK_HOURS
  );
}

function pickNextRequest() {
  const acknowledged = readAcknowledgedIds();
  return pendingRequests.value.find((item) => !acknowledged.has(item.id));
}

function enqueueRequest(record: InspectionRequest) {
  if (!isRecentSubmittedRequest(record)) return;
  window.dispatchEvent(
    new CustomEvent('qms:inspection-request-created', { detail: record }),
  );
  const acknowledged = readAcknowledgedIds();
  if (acknowledged.has(record.id)) return;
  if (pendingRequests.value.some((item) => item.id === record.id)) return;

  pendingRequests.value = [record, ...pendingRequests.value];
  if (!open.value) showNextRequest();
}

function showNextRequest() {
  const next = pickNextRequest();
  if (!next) {
    activeRequest.value = undefined;
    open.value = false;
    return;
  }

  activeRequest.value = next;
  open.value = true;
}

function connectInspectionRequestEvents() {
  if (!accessStore.accessToken || eventSource) return;

  eventSource = new EventSource('/api/qms/inspection/requests/events');
  eventSource.addEventListener('inspection-request-created', (event) => {
    try {
      const payload = JSON.parse((event as MessageEvent).data) as {
        request?: InspectionRequest;
      };
      if (payload.request) enqueueRequest(payload.request);
    } catch {
      // Ignore malformed SSE payloads and keep the connection alive.
    }
  });
  eventSource.addEventListener('error', () => {
    eventSource?.close();
    eventSource = undefined;
  });
}

async function pollInspectionRequests() {
  if (!accessStore.accessToken || loading.value) return;

  loading.value = true;
  try {
    const res = await getInspectionRequests({
      page: 1,
      pageSize: 20,
      status: 'SUBMITTED',
    });
    const acknowledged = readAcknowledgedIds();
    pendingRequests.value = (res.items || []).filter(
      (item) => isRecentSubmittedRequest(item) && !acknowledged.has(item.id),
    );
    if (!open.value) showNextRequest();
  } catch {
    // The global alert should never interrupt normal page work.
  } finally {
    loading.value = false;
  }
}

function markActiveRead() {
  if (!activeRequest.value) return;
  const acknowledged = readAcknowledgedIds();
  acknowledged.add(activeRequest.value.id);
  saveAcknowledgedIds(acknowledged);
  pendingRequests.value = pendingRequests.value.filter(
    (item) => item.id !== activeRequest.value?.id,
  );
}

function handleMarkRead() {
  markActiveRead();
  showNextRequest();
}

async function handleViewTask() {
  if (!activeRequest.value) return;
  const id = activeRequest.value.id;
  markActiveRead();
  open.value = false;
  await router.push({
    path: '/qms/inspection/requests',
    query: { dispatchRequestId: id },
  });
}

onMounted(() => {
  connectInspectionRequestEvents();
  void pollInspectionRequests();
  timer = window.setInterval(() => {
    connectInspectionRequestEvents();
    void pollInspectionRequests();
  }, POLL_INTERVAL_MS);
});

watch(
  () => accessStore.accessToken,
  (token) => {
    if (!token) {
      eventSource?.close();
      eventSource = undefined;
      return;
    }
    connectInspectionRequestEvents();
    void pollInspectionRequests();
  },
);

onUnmounted(() => {
  if (timer) window.clearInterval(timer);
  eventSource?.close();
  eventSource = undefined;
});
</script>

<template>
  <Modal
    v-model:open="open"
    centered
    :closable="false"
    :footer="null"
    :keyboard="false"
    :mask-closable="false"
    :width="680"
    wrap-class-name="inspection-request-global-alert"
  >
    <div v-if="activeRequest" class="overflow-hidden rounded-2xl bg-white">
      <div class="bg-gradient-to-r from-orange-50 to-white px-8 py-7">
        <div class="flex items-center gap-3">
          <div
            class="flex size-10 items-center justify-center rounded-xl bg-orange-500 text-white"
          >
            <IconifyIcon icon="lucide:bell-ring" class="text-xl" />
          </div>
          <Tag color="orange">待派单</Tag>
        </div>
        <div class="mt-4 text-2xl font-semibold text-gray-900">
          新报检任务待处理
        </div>
        <div class="mt-2 text-sm text-gray-500">
          {{ dayjs(activeRequest.submittedAt).format('YYYY-MM-DD HH:mm:ss') }}
        </div>
      </div>

      <div class="px-8 py-7">
        <div class="border-l-4 border-orange-400 pl-5">
          <div class="text-lg font-semibold text-gray-900">
            {{ taskTitle || '未填写部件信息' }}
          </div>
          <div class="mt-3 grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
            <div>
              <span class="text-gray-500">工单号：</span>
              <span class="font-medium text-gray-900">
                {{ activeRequest.workOrderNumber || '-' }}
              </span>
            </div>
            <div>
              <span class="text-gray-500">报检人：</span>
              <span class="font-medium text-gray-900">
                {{ activeRequest.reporter || '-' }}
              </span>
            </div>
            <div>
              <span class="text-gray-500">班组：</span>
              <span class="font-medium text-gray-900">
                {{ activeRequest.team || '-' }}
              </span>
            </div>
            <div>
              <span class="text-gray-500">数量：</span>
              <span class="font-medium text-gray-900">
                {{ activeRequest.quantity || 1 }}
              </span>
            </div>
          </div>
          <div
            v-if="activeRequest.requestInfo"
            class="mt-4 text-sm text-gray-600"
          >
            {{ activeRequest.requestInfo }}
          </div>
        </div>
      </div>

      <div
        class="flex flex-wrap items-center justify-between gap-3 border-t bg-gray-50 px-8 py-5"
      >
        <div class="text-xs text-gray-500">
          {{
            pendingRequests.length > 1
              ? `还有 ${pendingRequests.length - 1} 条未读报检`
              : '请及时安排检验派单'
          }}
        </div>
        <div class="flex items-center gap-3">
          <Button @click="handleMarkRead">标记已读</Button>
          <Button type="primary" @click="handleViewTask">
            <template #icon>
              <IconifyIcon icon="lucide:list-checks" />
            </template>
            查看任务
          </Button>
        </div>
      </div>
    </div>
  </Modal>
</template>

<style scoped>
:global(.inspection-request-global-alert .ant-modal-content) {
  padding: 0;
  overflow: hidden;
  border-radius: 24px;
}

:global(.inspection-request-global-alert .ant-modal-body) {
  padding: 0;
}

:global(.inspection-request-global-alert .ant-modal-mask) {
  backdrop-filter: blur(5px);
}
</style>
