<script setup lang="ts">
import { IconifyIcon } from '@vben/icons';

import { Button, Modal } from 'ant-design-vue';

interface Props {
  open: boolean;
  qrCode: string;
  url: string;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  copy: [];
  openPage: [];
  'update:open': [value: boolean];
}>();
</script>

<template>
  <Modal
    :open="props.open"
    title="扫码报检入口"
    :footer="null"
    :width="460"
    @update:open="(value) => emit('update:open', value)"
  >
    <div class="space-y-4">
      <div class="flex flex-col items-center rounded border bg-gray-50 p-4">
        <img
          v-if="props.qrCode"
          :src="props.qrCode"
          alt="扫码报检二维码"
          class="size-[180px]"
        />
        <div class="mt-2 text-center text-xs text-gray-500">
          车间扫码进入独立报检填报页
        </div>
      </div>
      <div class="rounded border bg-white px-3 py-2 text-xs text-gray-600">
        {{ props.url }}
      </div>
      <div class="flex flex-wrap justify-end gap-2">
        <Button @click="emit('copy')">
          <template #icon>
            <IconifyIcon icon="lucide:copy" />
          </template>
          复制链接
        </Button>
        <Button type="primary" @click="emit('openPage')">
          <template #icon>
            <IconifyIcon icon="lucide:external-link" />
          </template>
          打开页面
        </Button>
      </div>
    </div>
  </Modal>
</template>
