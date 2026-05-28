<template>
  <div class="mobile-dispatch">
    <a-spin :spinning="loading">
      <a-descriptions
        v-if="task"
        class="task-detail"
        :column="1"
        bordered
        size="small"
      >
        <a-descriptions-item label="Request no">
          {{ task.requestNo }}
        </a-descriptions-item>
        <a-descriptions-item label="Work order">
          {{ task.workOrderNumber }}
        </a-descriptions-item>
        <a-descriptions-item label="Part">
          {{ task.partName }}
        </a-descriptions-item>
        <a-descriptions-item label="Process">
          {{ task.processName }}
        </a-descriptions-item>
        <a-descriptions-item label="Reporter">
          {{ task.reporter }}
        </a-descriptions-item>
      </a-descriptions>

      <a-form class="dispatch-form" layout="vertical">
        <a-form-item label="Inspector" required>
          <a-select
            v-model:value="form.inspectorId"
            :options="inspectorOptions"
            placeholder="Select inspector"
            show-search
          />
        </a-form-item>
        <a-form-item label="Priority">
          <a-input-number v-model:value="form.priority" :max="5" :min="1" />
        </a-form-item>
        <a-form-item label="Remark">
          <a-textarea
            v-model:value="form.dispatchRemark"
            :maxlength="200"
            placeholder="Optional dispatch remark"
            :rows="3"
          />
        </a-form-item>
        <a-button
          block
          type="primary"
          :disabled="!form.inspectorId"
          :loading="submitting"
          @click="submitDispatch"
        >
          Dispatch
        </a-button>
      </a-form>
    </a-spin>
  </div>
</template>

<script setup lang="ts">
import type { InspectionRequest } from '#/api/qms/inspection-request';

import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { message } from 'ant-design-vue';

import {
  dispatchInspectionRequest,
  getInspectionRequest,
} from '#/api/qms/inspection-request';
import { getUserList } from '#/api/system/user';

const route = useRoute();
const router = useRouter();
const loading = ref(false);
const submitting = ref(false);
const task = ref<InspectionRequest | null>(null);
const inspectors = ref<Array<{ id: string; label: string }>>([]);
const form = reactive({
  dispatchRemark: '',
  inspectorId: '',
  priority: 3,
});

const requestId = computed(() => String(route.params.id || ''));
const inspectorOptions = computed(() =>
  inspectors.value.map((item) => ({ label: item.label, value: item.id })),
);

async function loadDetail() {
  loading.value = true;
  try {
    const [detail, users] = await Promise.all([
      getInspectionRequest(requestId.value),
      getUserList({ page: 1, pageSize: 100 }),
    ]);
    task.value = detail;
    inspectors.value = users.items.map((user) => ({
      id: user.id,
      label: user.realName || user.username,
    }));
  } finally {
    loading.value = false;
  }
}

async function submitDispatch() {
  if (!requestId.value || !form.inspectorId) return;
  submitting.value = true;
  try {
    await dispatchInspectionRequest(requestId.value, {
      dispatchRemark: form.dispatchRemark || undefined,
      inspectorId: form.inspectorId,
      priority: form.priority,
    });
    message.success('Dispatched');
    await router.replace('/mobile/tasks');
  } finally {
    submitting.value = false;
  }
}

onMounted(() => {
  void loadDetail();
});
</script>

<style scoped>
.mobile-dispatch {
  display: grid;
  gap: 12px;
}

.task-detail,
.dispatch-form {
  padding: 12px;
  background: #fff;
  border: 1px solid #ececec;
  border-radius: 8px;
}

.dispatch-form {
  margin-top: 12px;
}
</style>
