<script setup lang="ts">
import type { UploadChangeParam, UploadProps } from 'ant-design-vue';
import type { UploadFile } from 'ant-design-vue/es/upload/interface';

import type { InspectionRequest } from '#/api/qms/inspection-request';

import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { useAccessStore } from '@vben/stores';

import {
  Button,
  Descriptions,
  DescriptionsItem,
  Form,
  FormItem,
  message,
  Segmented,
  Spin,
  Switch,
  Textarea,
  Upload,
} from 'ant-design-vue';

import {
  closeInspectionRequest,
  getInspectionRequest,
} from '#/api/qms/inspection-request';
import {
  applyUploadResponse,
  normalizeUploadFileList,
} from '#/views/qms/shared/utils/upload-file';

const route = useRoute();
const router = useRouter();
const accessStore = useAccessStore();
const loading = ref(false);
const submitting = ref(false);
const task = ref<InspectionRequest | null>(null);
const fileList = ref<UploadFile[]>([]);
const form = reactive({
  closeRemark: '',
  hasDocuments: true,
  result: 'PASS' as 'FAIL' | 'PASS',
});

const resultOptions = [
  { label: 'Pass', value: 'PASS' },
  { label: 'Fail', value: 'FAIL' },
];
const requestId = computed(() => String(route.params.id || ''));
const uploadHeaders = computed(() => ({
  Authorization: `Bearer ${accessStore.accessToken}`,
}));

const beforeUpload: UploadProps['beforeUpload'] = () => true;

function handleUploadChange(info: UploadChangeParam<UploadFile>) {
  if (info.file.status === 'done') {
    if (applyUploadResponse(info.file)) {
      message.success(`${info.file.name} uploaded`);
    } else {
      message.warning('Photo uploaded without a valid file URL');
    }
  } else if (info.file.status === 'error') {
    message.error(`${info.file.name} upload failed`);
  }
  fileList.value = [...info.fileList];
}

async function loadDetail() {
  loading.value = true;
  try {
    task.value = await getInspectionRequest(requestId.value);
  } finally {
    loading.value = false;
  }
}

async function submitResult() {
  if (!task.value) return;
  submitting.value = true;
  try {
    const quantity = task.value.quantity || 1;
    await closeInspectionRequest(requestId.value, {
      attachments: normalizeUploadFileList(fileList.value, 'Inspection photo'),
      closeRemark: form.closeRemark || undefined,
      hasDocuments: form.hasDocuments,
      qualifiedQuantity: form.result === 'PASS' ? quantity : 0,
      quantity,
      result: form.result,
      unqualifiedQuantity: form.result === 'FAIL' ? quantity : 0,
    });
    message.success('Inspection submitted');
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
  <div class="mobile-inspect">
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
        <DescriptionsItem label="数量">
          {{ task.quantity }}
        </DescriptionsItem>
      </Descriptions>

      <Form class="inspect-form" layout="vertical">
        <FormItem label="检验结果" required>
          <Segmented
            v-model:value="form.result"
            block
            :options="resultOptions"
          />
        </FormItem>
        <FormItem label="是否有资料" required>
          <Switch
            v-model:checked="form.hasDocuments"
            checked-children="有"
            un-checked-children="无"
          />
        </FormItem>
        <FormItem label="备注">
          <Textarea
            v-model:value="form.closeRemark"
            :maxlength="300"
            placeholder="检验备注（选填）"
            :rows="4"
          />
        </FormItem>
        <FormItem v-if="form.result === 'FAIL'" label="照片">
          <Upload
            v-model:file-list="fileList"
            accept="image/*"
            action="/api/upload"
            capture="environment"
            :headers="uploadHeaders"
            list-type="picture-card"
            :max-count="3"
            :multiple="false"
            :before-upload="beforeUpload"
            @change="handleUploadChange"
          >
            <div v-if="fileList.length < 3">拍照</div>
          </Upload>
        </FormItem>
        <Button
          block
          type="primary"
          :loading="submitting"
          @click="submitResult"
        >
          提交结果
        </Button>
      </Form>
    </Spin>
  </div>
</template>

<style scoped>
.mobile-inspect {
  display: grid;
  gap: 12px;
}

.task-detail,
.inspect-form {
  padding: 12px;
  background: #fff;
  border: 1px solid #ececec;
  border-radius: 8px;
}

.inspect-form {
  margin-top: 12px;
}
</style>
