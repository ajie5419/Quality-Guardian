<script setup lang="ts">
import { IconifyIcon } from '@vben/icons';

import { Button } from 'ant-design-vue';

interface Props {
  submitting: boolean;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  submit: [];
}>();
</script>

<template>
  <div
    class="inspection-entry-submit fixed inset-x-0 bottom-0 z-20 bg-white/95 px-3 pb-[calc(env(safe-area-inset-bottom)+10px)] pt-3 shadow-[0_-8px_20px_rgba(15,23,42,0.08)] backdrop-blur sm:static sm:inset-auto sm:bg-transparent sm:px-0 sm:pb-0 sm:pt-0 sm:shadow-none"
  >
    <Button
      type="primary"
      block
      size="large"
      :loading="props.submitting"
      @click="emit('submit')"
    >
      <template v-if="!props.submitting" #icon>
        <IconifyIcon icon="lucide:plus" />
      </template>
      {{ props.submitting ? '提交中，请勿重复点击' : '提交报检' }}
    </Button>
  </div>
</template>
