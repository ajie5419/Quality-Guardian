<script setup lang="ts">
import type { InspectionRequest } from '#/api/qms/inspection-request';

import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';

import { getInspectionRequests } from '#/api/qms/inspection-request';

import { useWechatAuth } from './composables/useWechatAuth';

const router = useRouter();
const { user } = useWechatAuth();
const loading = ref(false);
const tasks = ref<InspectionRequest[]>([]);

const isDispatcher = computed(() => {
  const role = user.value?.role.toLowerCase() || '';
  return (
    role.includes('admin') ||
    role.includes('dispatch') ||
    role.includes('manager') ||
    role.includes('schedule')
  );
});

function priorityLabel(priority: number) {
  if (priority <= 1) return 'Urgent';
  if (priority === 2) return 'High';
  return 'Normal';
}

function priorityColor(priority: number) {
  if (priority <= 1) return 'red';
  if (priority === 2) return 'orange';
  return 'blue';
}

function formatDate(value: string) {
  if (!value) return '-';
  return new Date(value).toLocaleString();
}

function goDetail(task: InspectionRequest) {
  const routeName = isDispatcher.value ? 'dispatch' : 'inspect';
  void router.push(`/mobile/${routeName}/${task.id}`);
}

async function loadTasks() {
  loading.value = true;
  try {
    const res = await getInspectionRequests({
      mine: !isDispatcher.value,
      page: 1,
      pageSize: 50,
      status: isDispatcher.value ? 'SUBMITTED' : 'DISPATCHED',
    });
    tasks.value = res.items || [];
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void loadTasks();
});
</script>

<template>
  <div class="task-list">
    <a-spin :spinning="loading">
      <div
        v-for="task in tasks"
        :key="task.id"
        class="task-card"
        @click="goDetail(task)"
      >
        <div class="task-header">
          <span class="task-no">{{ task.requestNo }}</span>
          <a-tag :color="priorityColor(task.priority)">
            {{ priorityLabel(task.priority) }}
          </a-tag>
        </div>
        <div class="task-info">
          <div>Work order: {{ task.workOrderNumber }}</div>
          <div>Part: {{ task.partName }}</div>
          <div>Process: {{ task.processName }}</div>
          <div>Reporter: {{ task.reporter }}</div>
          <div>
            Submitted: {{ formatDate(task.submittedAt || task.createdAt) }}
          </div>
        </div>
      </div>
      <a-empty
        v-if="tasks.length === 0 && !loading"
        class="task-empty"
        description="No pending tasks"
      />
    </a-spin>
  </div>
</template>

<style scoped>
.task-list {
  min-height: calc(100vh - 64px);
}

.task-card {
  padding: 14px;
  margin-bottom: 12px;
  background: #fff;
  border: 1px solid #ececec;
  border-radius: 8px;
}

.task-header {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.task-no {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 15px;
  font-weight: 600;
  color: #111827;
  white-space: nowrap;
}

.task-info {
  display: grid;
  gap: 6px;
  font-size: 13px;
  line-height: 1.5;
  color: #4b5563;
}

.task-empty {
  padding-top: 80px;
}
</style>
