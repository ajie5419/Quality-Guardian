<script lang="ts" setup>
import { Page } from '@vben/common-ui';

import QmsPageShell from '#/views/qms/shared/components/QmsPageShell.vue';

import BomPlanningView from './components/BomPlanningView.vue';
</script>

<template>
  <Page content-class="h-full p-0">
    <QmsPageShell content-class="h-full">
      <BomPlanningView />
    </QmsPageShell>
  </Page>
</template>
