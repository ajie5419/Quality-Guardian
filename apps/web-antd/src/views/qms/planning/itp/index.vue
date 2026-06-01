<script lang="ts" setup>
import { onMounted } from 'vue';
import { useRouter } from 'vue-router';

import { Page } from '@vben/common-ui';

import QmsPageShell from '#/views/qms/shared/components/QmsPageShell.vue';

const router = useRouter();

onMounted(() => {
  router.replace('/qms/planning/inspection-forms');
});
</script>

<template>
  <Page content-class="p-0">
    <QmsPageShell>
      <div class="text-sm text-gray-500">正在跳转到检验表模板...</div>
    </QmsPageShell>
  </Page>
</template>
