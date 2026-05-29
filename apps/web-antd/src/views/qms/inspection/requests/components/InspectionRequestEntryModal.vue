<script setup lang="ts">
import { IconifyIcon } from '@vben/icons';

import { Button, Input, Modal } from 'ant-design-vue';

interface Props {
  open: boolean;
  qrCode: string;
  url: string;
  canConfig?: boolean;
  baseUrl?: string;
  saving?: boolean;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  copy: [];
  openPage: [];
  saveBaseUrl: [value: string];
  'update:baseUrl': [value: string];
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
      <div
        v-if="props.canConfig"
        class="space-y-2 rounded border border-dashed bg-gray-50 px-3 py-3"
      >
        <div class="text-xs font-medium text-gray-700">二维码访问地址</div>
        <Input
          :value="props.baseUrl"
          placeholder="如 http://8.141.123.254，留空则用当前访问地址"
          allow-clear
          @update:value="(value) => emit('update:baseUrl', value ?? '')"
        />
        <div class="text-[11px] leading-relaxed text-gray-400">
          配置后所有二维码都指向此地址，不受打开后台时用域名还是 IP 影响。修改后立即生效，无需重新部署。
        </div>
        <div class="flex justify-end">
          <Button
            type="primary"
            size="small"
            :loading="props.saving"
            @click="emit('saveBaseUrl', props.baseUrl ?? '')"
          >
            保存地址
          </Button>
        </div>
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
