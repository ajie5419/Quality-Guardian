<script lang="ts" setup>
import { Page } from '@vben/common-ui';

import QmsPageShell from '#/views/qms/shared/components/QmsPageShell.vue';

import WelderManagementView from './components/WelderManagementView.vue';
</script>

<template>
  <Page content-class="p-0">
    <QmsPageShell>
      <WelderManagementView />
    </QmsPageShell>
  </Page>
</template>
