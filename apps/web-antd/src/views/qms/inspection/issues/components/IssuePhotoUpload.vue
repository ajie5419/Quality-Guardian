<script lang="ts" setup>
import type { UploadChangeParam, UploadFile } from 'ant-design-vue';

import type { UploadFileWithResponse } from '../types';

import { computed } from 'vue';

import { useI18n } from '@vben/locales';
import { useAccessStore } from '@vben/stores';

import { message, Upload } from 'ant-design-vue';

import { UI_CONSTANTS } from '../constants';

const props = defineProps<{
  maxCount?: number;
}>();

const photos = defineModel<UploadFileWithResponse[]>('photos', {
  default: () => [],
});

const { t } = useI18n();
const accessStore = useAccessStore();

const uploadHeaders = computed(() => {
  return {
    Authorization: `Bearer ${accessStore.accessToken}`,
  };
});

const maxImages = computed(
  () =>
    photos.value.length < (props?.maxCount ?? UI_CONSTANTS.MAX_UPLOAD_IMAGES),
);

function handleUploadChange(info: UploadChangeParam<UploadFile>) {
  if (info.file.status === 'done') {
    message.success(`${info.file.name} ${t('common.saveSuccess')}`);
  } else if (info.file.status === 'error') {
    message.error(`${info.file.name} ${t('common.loadFailed')}`);
  }
}
</script>

<template>
  <div>
    <label class="mb-1 block text-sm font-medium text-gray-700">
      {{ t('qms.inspection.issues.photos') }}
    </label>
    <Upload
      v-model:file-list="photos"
      action="/api/upload"
      :headers="uploadHeaders"
      list-type="picture-card"
      name="file"
      @change="handleUploadChange"
    >
      <div v-if="maxImages">
        <span class="i-lucide-plus text-xl"></span>
        <div style="margin-top: 8px">
          {{ t('qms.inspection.issues.upload-image') }}
        </div>
      </div>
    </Upload>
  </div>
</template>
