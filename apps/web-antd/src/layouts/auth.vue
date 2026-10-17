<script lang="ts" setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router';

import { AuthPageLayout } from '@vben/layouts';
import { preferences } from '@vben/preferences';

import { $t } from '#/locales';
import { identityRedirect } from '#/utils/identity-redirect';

const route = useRoute();
// Bridge logins hide QMS branding; the form itself names the target system.
const isBridge = computed(() =>
  Boolean(identityRedirect(route.query.redirect)),
);
const appName = computed(() => (isBridge.value ? '' : preferences.app.name));
const logo = computed(() => (isBridge.value ? '' : preferences.logo.source));
const pageTitle = computed(() =>
  isBridge.value ? '' : $t('authentication.pageTitle'),
);
const pageDescription = computed(() =>
  isBridge.value ? '' : $t('authentication.pageDesc'),
);
</script>

<template>
  <AuthPageLayout
    :app-name="appName"
    :logo="logo"
    :page-description="pageDescription"
    :page-title="pageTitle"
  >
    <!-- 自定义工具栏 -->
    <!-- <template #toolbar></template> -->
  </AuthPageLayout>
</template>
