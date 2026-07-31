<script setup lang="ts">
import type { InspectionRequest } from '@qgs/shared';

import { reactive, ref, watch } from 'vue';

import {
  Alert,
  Form,
  Input,
  message,
  Radio,
  RadioGroup,
  Select,
} from 'ant-design-vue';

import { approveInspectionMaterialRequest } from '#/api/qms/inspection-request';
import { getPartMasterOptionsApi } from '#/api/system/part-master';
import { useErrorHandler } from '#/hooks/useErrorHandler';

const props = defineProps<{
  request: InspectionRequest;
}>();
const emit = defineEmits<{
  approved: [request: InspectionRequest];
  saving: [value: boolean];
}>();
const { handleApiError } = useErrorHandler();

const mode = ref<'CREATE' | 'LINK_EXISTING'>('LINK_EXISTING');
const draft = reactive({ name: '', partId: '', remark: '' });
const options = ref<Array<{ label: string; value: string }>>([]);
const loading = ref(false);
let searchSequence = 0;

async function searchOptions(keyword = '') {
  const normalizedKeyword = keyword.trim();
  const sequence = ++searchSequence;
  if (!normalizedKeyword) {
    options.value = [];
    return;
  }
  loading.value = true;
  try {
    const result = await getPartMasterOptionsApi({
      keyword: normalizedKeyword,
      take: 20,
    });
    if (sequence !== searchSequence) return;
    options.value = result.map((item) => ({
      label: item.name,
      value: item.id,
    }));
  } catch (error: unknown) {
    if (sequence === searchSequence) {
      handleApiError(error, '搜索物料主数据');
    }
  } finally {
    if (sequence === searchSequence) loading.value = false;
  }
}

watch(
  () => props.request.id,
  () => {
    mode.value = 'LINK_EXISTING';
    draft.name = props.request.requestedPartName || props.request.partName;
    draft.partId = '';
    draft.remark = '';
    void searchOptions(draft.name);
  },
  { immediate: true },
);

async function approve() {
  if (!props.request.materialRequestId) {
    message.error('未找到待审核物料申请');
    return;
  }
  if (mode.value === 'LINK_EXISTING' && !draft.partId) {
    message.warning('请选择已有物料');
    return;
  }
  if (mode.value === 'CREATE' && !draft.name.trim()) {
    message.warning('请输入规范物料名称');
    return;
  }
  emit('saving', true);
  try {
    const request = await approveInspectionMaterialRequest(
      props.request.materialRequestId,
      mode.value === 'CREATE'
        ? {
            mode: 'CREATE',
            name: draft.name.trim(),
            remark: draft.remark.trim() || undefined,
          }
        : {
            mode: 'LINK_EXISTING',
            partId: draft.partId,
            remark: draft.remark.trim() || undefined,
          },
    );
    message.success('物料审核通过，请继续完成派单');
    emit('approved', request);
  } catch (error: unknown) {
    handleApiError(error, '审核物料申请');
  } finally {
    emit('saving', false);
  }
}

defineExpose({ approve });
</script>

<template>
  <Alert
    class="mb-4"
    :message="`物料“${request.requestedPartName || request.partName}”需要先审核`"
    show-icon
    type="warning"
  />
  <Form layout="vertical">
    <Form.Item label="审核方式" required>
      <RadioGroup v-model:value="mode">
        <Radio value="LINK_EXISTING">关联已有物料</Radio>
        <Radio value="CREATE">新建规范物料</Radio>
      </RadioGroup>
    </Form.Item>
    <Form.Item v-if="mode === 'LINK_EXISTING'" label="规范物料" required>
      <Select
        v-model:value="draft.partId"
        :filter-option="false"
        :loading="loading"
        :options="options"
        allow-clear
        show-search
        placeholder="输入物料名称搜索"
        @search="searchOptions"
      />
    </Form.Item>
    <Form.Item v-else label="规范物料名称" required>
      <Input v-model:value="draft.name" :maxlength="200" />
    </Form.Item>
    <Form.Item label="审核备注">
      <Input.TextArea v-model:value="draft.remark" :maxlength="500" />
    </Form.Item>
  </Form>
</template>
