<script setup lang="ts">
import { IconifyIcon } from '@vben/icons';

import { Button } from 'ant-design-vue';

const emit = defineEmits<{
  openEntry: [];
  refresh: [];
}>();
</script>

<template>
  <div
    class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
  >
    <div>
      <h1 class="text-xl font-semibold text-gray-900">报检任务</h1>
      <div class="mt-1 text-sm text-gray-500">
        处理车间扫码提交后的派单、检验和关闭任务
      </div>
    </div>
    <div class="flex flex-wrap gap-2">
      <Button @click="emit('openEntry')">
        <template #icon>
          <IconifyIcon icon="lucide:qr-code" />
        </template>
        扫码入口
      </Button>
      <Button @click="emit('refresh')">
        <template #icon>
          <IconifyIcon icon="lucide:refresh-cw" />
        </template>
        刷新
      </Button>
    </div>
  </div>
</template>
