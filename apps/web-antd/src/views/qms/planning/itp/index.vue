<script lang="ts" setup>
import { onMounted } from 'vue';
import { useRouter } from 'vue-router';

import { Page } from '@vben/common-ui';

const router = useRouter();

onMounted(() => {
  router.replace('/qms/planning/inspection-forms');
});
</script>

<template>
  <Page>
    <div class="p-6 text-sm text-gray-500">正在跳转到检验表模板...</div>
  </Page>
</template>
