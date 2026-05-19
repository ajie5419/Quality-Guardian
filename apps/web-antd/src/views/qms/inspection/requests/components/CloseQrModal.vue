<script setup lang="ts">
import type { InspectionRequest } from '#/api/qms/inspection-request';

import { Modal } from 'ant-design-vue';

interface Props {
  open: boolean;
  qrCode: string;
  request?: InspectionRequest;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  'update:open': [value: boolean];
}>();

function handleUpdateOpen(value: boolean) {
  emit('update:open', value);
}
</script>

<template>
  <Modal
    :open="props.open"
    title="扫码关闭二维码"
    :footer="null"
    width="360px"
    @update:open="handleUpdateOpen"
  >
    <div v-if="props.request" class="flex flex-col items-center gap-3">
      <img
        v-if="props.qrCode"
        :src="props.qrCode"
        alt="扫码关闭二维码"
        class="size-[180px]"
      />
      <div class="text-center text-sm font-medium">
        {{ props.request.requestNo }}
      </div>
      <div
        class="w-full rounded border border-gray-100 bg-gray-50 px-3 py-2 text-xs text-gray-700"
      >
        <div class="grid grid-cols-[64px_minmax(0,1fr)] gap-x-2 gap-y-1">
          <span class="text-gray-500">报检人</span>
          <span class="break-words font-medium text-gray-900">
            {{ props.request.reporter || '-' }}
          </span>
          <span class="text-gray-500">报检部件</span>
          <span class="break-words font-medium text-gray-900">
            {{ props.request.partName }}
            <template v-if="props.request.componentName">
              / {{ props.request.componentName }}
            </template>
          </span>
          <span class="text-gray-500">工序</span>
          <span class="break-words font-medium text-gray-900">
            {{ props.request.processName || '-' }}
          </span>
        </div>
      </div>
      <div class="text-center text-xs text-gray-500">
        检验员扫码后会打开派单详情，可在详情中完成检验
      </div>
    </div>
  </Modal>
</template>
