<script lang="ts" setup>
import type { UploadChangeParam, UploadFile } from 'ant-design-vue';

import type { UploadFileWithResponse } from '#/types';

import { computed } from 'vue';

import { useI18n } from '@vben/locales';
import { useAccessStore } from '@vben/stores';

import { message, Upload } from 'ant-design-vue';

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

const MAX_UPLOAD_LIMIT = 8;

const maxImages = computed(
  () => photos.value.length < (props?.maxCount ?? MAX_UPLOAD_LIMIT),
);

function handleUploadChange(info: UploadChangeParam<UploadFile>) {
  if (info.file.status === 'done') {
    const response = info.file.response as any;
    if (response?.code === 0 && response.data?.url) {
      info.file.url = response.data.url;
    }
    message.success(`${info.file.name} ${t('common.saveSuccess')}`);
  } else if (info.file.status === 'error') {
    message.error(`${info.file.name} ${t('common.actionFailed')}`);
  }
}
</script>

<template>
  <div class="rounded-lg border border-gray-100 bg-gray-50/50 p-3">
    <div class="mb-3 border-l-4 border-blue-500 pl-2 font-bold text-gray-700">
      {{ t('qms.afterSales.form.photos') }}
    </div>
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
          {{ t('qms.afterSales.form.upload-image') }}
        </div>
      </div>
    </Upload>
  </div>
</template>
