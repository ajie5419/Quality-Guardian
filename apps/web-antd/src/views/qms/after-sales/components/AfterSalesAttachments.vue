<script lang="ts" setup>
import type { UploadFile } from 'ant-design-vue';

import { useI18n } from '@vben/locales';

import { FormItem, Upload } from 'ant-design-vue';

defineProps<{
  fileList: UploadFile[];
}>();

const emit = defineEmits<{
  preview: [file: UploadFile];
  remove: [file: UploadFile];
  'update:fileList': [files: UploadFile[]];
}>();

const { t } = useI18n();

function handleChange(info: { fileList: UploadFile[] }) {
  emit('update:fileList', info.fileList);
}

function handlePreview(file: UploadFile) {
  emit('preview', file);
}

function handleRemove(file: UploadFile) {
  emit('remove', file);
  return true;
}
</script>

<template>
  <div class="rounded-lg border border-gray-100 bg-gray-50/50 p-3">
    <div class="mb-3 border-l-4 border-orange-500 pl-2 font-bold text-gray-700">
      {{ t('qms.afterSales.form.attachments') }}
    </div>
    <FormItem class="mb-0">
      <Upload
        :file-list="fileList"
        list-type="picture-card"
        :multiple="true"
        :before-upload="() => false"
        @change="handleChange"
        @preview="handlePreview"
        @remove="handleRemove"
      >
        <div>
          <span class="i-lucide-plus text-xl"></span>
          <div class="mt-2">{{ t('qms.afterSales.actions.upload') }}</div>
        </div>
      </Upload>
    </FormItem>
  </div>
</template>
