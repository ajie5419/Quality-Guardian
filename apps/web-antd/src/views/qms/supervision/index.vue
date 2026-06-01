<script lang="ts" setup>
import { Page } from '@vben/common-ui';

import QmsPageShell from '#/views/qms/shared/components/QmsPageShell.vue';

import SupervisionManagementView from './components/SupervisionManagementView.vue';
</script>

<template>
  <Page content-class="p-0">
    <QmsPageShell>
      <SupervisionManagementView />
    </QmsPageShell>
  </Page>
</template>
