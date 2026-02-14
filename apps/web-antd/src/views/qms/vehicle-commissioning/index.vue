<script lang="ts" setup>
import { Page } from '@vben/common-ui';
import { useI18n } from '@vben/locales';

import { Empty } from 'ant-design-vue';

const { t } = useI18n();
</script>

<template>
  <Page content-class="p-4">
    <div
      class="flex min-h-[360px] items-center justify-center rounded-lg border border-dashed border-gray-200 bg-white"
    >
      <Empty :description="t('common.comingSoon')" />
    </div>
  </Page>
</template>
