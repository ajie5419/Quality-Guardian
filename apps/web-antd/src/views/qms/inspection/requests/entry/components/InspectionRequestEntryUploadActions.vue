<script setup lang="ts">
import type { UploadChangeParam, UploadFile } from 'ant-design-vue';

import { IconifyIcon } from '@vben/icons';

import { Button, Upload } from 'ant-design-vue';

interface Props {
  beforePhotoUpload: (file: File) => Promise<File | true>;
  disabled: boolean;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  change: [info: UploadChangeParam<UploadFile>];
}>();

const files = defineModel<UploadFile[]>('fileList', {
  default: () => [],
});
</script>

<template>
  <div class="flex flex-col gap-2 sm:flex-row">
    <Upload
      v-model:file-list="files"
      accept="image/*"
      action="/api/upload"
      capture="environment"
      :before-upload="props.beforePhotoUpload"
      :disabled="props.disabled"
      :show-upload-list="false"
      @change="(info) => emit('change', info)"
    >
      <Button class="w-full sm:w-auto">
        <template #icon>
          <IconifyIcon icon="lucide:camera" />
        </template>
        拍照上传
      </Button>
    </Upload>
    <Upload
      v-model:file-list="files"
      action="/api/upload"
      :disabled="props.disabled"
      multiple
      @change="(info) => emit('change', info)"
    >
      <Button class="w-full sm:w-auto">
        <template #icon>
          <IconifyIcon icon="lucide:upload" />
        </template>
        选择文件
      </Button>
    </Upload>
  </div>
</template>
