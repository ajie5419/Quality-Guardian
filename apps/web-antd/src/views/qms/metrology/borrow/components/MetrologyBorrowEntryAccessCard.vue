<script lang="ts" setup>
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';

import { useI18n } from '@vben/locales';

import { Alert, Button, Input, message, Space } from 'ant-design-vue';
import QRCode from 'qrcode';

const { t } = useI18n();
const router = useRouter();
const qrcode = ref('');
const entryPath = '/qms/metrology/borrow/entry';

const entryUrl = computed(() => {
  if (typeof window === 'undefined') {
    return entryPath;
  }
  const routePath =
    import.meta.env.VITE_ROUTER_HISTORY === 'hash'
      ? `/#${entryPath}`
      : entryPath;
  return `${window.location.origin}${routePath}`;
});

watch(
  entryUrl,
  async (value) => {
    qrcode.value = await QRCode.toDataURL(value, {
      errorCorrectionLevel: 'H',
      margin: 2,
      width: 120,
    });
  },
  {
    immediate: true,
  },
);

async function copyText(text: string) {
  if (
    typeof navigator !== 'undefined' &&
    navigator.clipboard &&
    typeof navigator.clipboard.writeText === 'function'
  ) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.append(textarea);
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
}

async function handleCopyLink() {
  try {
    await copyText(entryUrl.value);
    message.success(t('qms.metrology.borrow.entryLinkCopied'));
  } catch {
    message.error(t('qms.metrology.borrow.entryLinkCopyFailed'));
  }
}

function handleOpenEntry() {
  void router.push(entryPath);
}
</script>

<template>
  <div class="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
    <div class="mb-3 text-sm font-medium text-gray-700">
      {{ t('qms.metrology.borrow.entryAccessTitle') }}
    </div>

    <div class="grid grid-cols-[120px_minmax(0,1fr)] gap-4">
      <div class="flex items-start justify-center">
        <img
          :src="qrcode"
          alt="borrow-entry-qrcode"
          class="h-[120px] w-[120px]"
        />
      </div>

      <div class="flex min-w-0 flex-col gap-3">
        <Alert
          :message="t('qms.metrology.borrow.entryAccessHint')"
          show-icon
          type="info"
        />

        <Input :value="entryUrl" readonly />

        <Space>
          <Button type="primary" @click="handleOpenEntry">
            {{ t('qms.metrology.borrow.openEntry') }}
          </Button>
          <Button @click="handleCopyLink">
            {{ t('qms.metrology.borrow.copyEntryLink') }}
          </Button>
        </Space>
      </div>
    </div>
  </div>
</template>
