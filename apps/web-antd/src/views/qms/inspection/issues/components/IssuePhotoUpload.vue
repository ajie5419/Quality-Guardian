<script lang="ts" setup>
import type { UploadFileWithResponse } from '../types';

import { computed } from 'vue';

import { useI18n } from '@vben/locales';

import QmsFileUpload from '#/views/qms/shared/components/QmsFileUpload.vue';

import { UI_CONSTANTS } from '../constants';

const props = defineProps<{
  maxCount?: number;
}>();

const photos = defineModel<UploadFileWithResponse[]>('value', {
  default: () => [],
});

const { t } = useI18n();

const maxImages = computed(
  () =>
    photos.value.length < (props?.maxCount ?? UI_CONSTANTS.MAX_UPLOAD_IMAGES),
);
</script>

<template>
  <div>
    <label class="mb-1 block text-sm font-medium text-gray-700">
      {{ t('qms.inspection.issues.photos') }}
    </label>
    <QmsFileUpload
      v-model:file-list="photos"
      list-type="picture-card"
      :max-count="props?.maxCount ?? UI_CONSTANTS.MAX_UPLOAD_IMAGES"
    >
      <div v-if="maxImages">
        <span class="i-lucide-plus text-xl"></span>
        <div style="margin-top: 8px">
          {{ t('qms.inspection.issues.upload-image') }}
        </div>
      </div>
    </QmsFileUpload>
  </div>
</template>
