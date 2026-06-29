<script setup lang="ts">
import type { InspectionRequest } from '@qgs/shared';

import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import {
  Button,
  Descriptions,
  DescriptionsItem,
  Form,
  FormItem,
  InputNumber,
  message,
  Select,
  Spin,
  Textarea,
} from 'ant-design-vue';

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

<template>
  <div class="mobile-dispatch">
    <Spin :spinning="loading">
      <Descriptions
        v-if="task"
        class="task-detail"
        :column="1"
        bordered
        size="small"
      >
        <DescriptionsItem label="编号">
          {{ task.requestNo }}
        </DescriptionsItem>
        <DescriptionsItem label="工单号">
          {{ task.workOrderNumber }}
        </DescriptionsItem>
        <DescriptionsItem label="零件">
          {{ task.partName }}
        </DescriptionsItem>
        <DescriptionsItem label="工序">
          {{ task.processName }}
        </DescriptionsItem>
        <DescriptionsItem label="报检人">
          {{ task.reporter }}
        </DescriptionsItem>
      </Descriptions>

      <Form class="dispatch-form" layout="vertical">
        <FormItem label="检验员" required>
          <Select
            v-model:value="form.inspectorId"
            :options="inspectorOptions"
            placeholder="请选择检验员"
            show-search
          />
        </FormItem>
        <FormItem label="优先级">
          <InputNumber v-model:value="form.priority" :max="5" :min="1" />
        </FormItem>
        <FormItem label="备注">
          <Textarea
            v-model:value="form.dispatchRemark"
            :maxlength="200"
            placeholder="派单备注（选填）"
            :rows="3"
          />
        </FormItem>
        <Button
          block
          type="primary"
          :disabled="!form.inspectorId"
          :loading="submitting"
          @click="submitDispatch"
        >
          确认派单
        </Button>
      </Form>
    </Spin>
  </div>
</template>

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
