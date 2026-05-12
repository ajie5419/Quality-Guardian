<script lang="ts" setup>
import type { UploadFileWithResponse } from '#/types';

import { computed } from 'vue';

import { useI18n } from '@vben/locales';

import QmsFileUpload from '#/views/qms/shared/components/QmsFileUpload.vue';

const props = defineProps<{
  maxCount?: number;
}>();

const photos = defineModel<UploadFileWithResponse[]>('photos', {
  default: () => [],
});

const { t } = useI18n();

const MAX_UPLOAD_LIMIT = 8;

const maxImages = computed(
  () => photos.value.length < (props?.maxCount ?? MAX_UPLOAD_LIMIT),
);
</script>

<template>
  <div class="rounded-lg border border-gray-100 bg-gray-50/50 p-3">
    <div class="mb-3 border-l-4 border-blue-500 pl-2 font-bold text-gray-700">
      {{ t('qms.afterSales.form.photos') }}
    </div>
    <QmsFileUpload
      v-model:file-list="photos"
      list-type="picture-card"
      :max-count="props?.maxCount ?? MAX_UPLOAD_LIMIT"
    >
      <div v-if="maxImages">
        <span class="i-lucide-plus text-xl"></span>
        <div style="margin-top: 8px">
          {{ t('qms.afterSales.form.upload-image') }}
        </div>
      </div>
    </QmsFileUpload>
  </div>
</template>
