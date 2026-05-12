<script lang="ts" setup>
import type { UploadChangeParam, UploadFile } from 'ant-design-vue';

import { computed } from 'vue';

import { useAccessStore } from '@vben/stores';

import { message, Upload } from 'ant-design-vue';

import { applyUploadResponse } from '#/views/qms/shared/utils/upload-file';

const props = withDefaults(
  defineProps<{
    accept?: string;
    buttonText?: string;
    disabled?: boolean;
    listType?: 'picture' | 'picture-card' | 'text';
    maxCount?: number;
    multiple?: boolean;
  }>(),
  {
    accept: undefined,
    buttonText: '上传文件',
    disabled: false,
    listType: 'text',
    maxCount: undefined,
    multiple: false,
  },
);

const emit = defineEmits<{
  change: [files: UploadFile[]];
  uploaded: [file: UploadFile];
}>();

const files = defineModel<UploadFile[]>('fileList', {
  default: () => [],
});

const accessStore = useAccessStore();

const uploadHeaders = computed(() => ({
  Authorization: `Bearer ${accessStore.accessToken}`,
}));

const canAddFile = computed(
  () => props.maxCount === undefined || files.value.length < props.maxCount,
);

function handleChange(info: UploadChangeParam<UploadFile>) {
  files.value = info.fileList;
  if (info.file.status === 'done') {
    if (applyUploadResponse(info.file)) {
      message.success(`${info.file.name} 上传成功`);
      emit('uploaded', info.file);
    }
  } else if (info.file.status === 'error') {
    message.error(`${info.file.name} 上传失败`);
  }
  emit('change', files.value);
}
</script>

<template>
  <Upload
    v-model:file-list="files"
    action="/api/upload"
    :accept="accept"
    :disabled="disabled"
    :headers="uploadHeaders"
    :list-type="listType"
    :max-count="maxCount"
    :multiple="multiple"
    name="file"
    @change="handleChange"
  >
    <slot v-if="canAddFile">
      <span class="inline-flex items-center gap-1">
        <span class="i-lucide-upload text-base"></span>
        <span>{{ buttonText }}</span>
      </span>
    </slot>
  </Upload>
</template>
