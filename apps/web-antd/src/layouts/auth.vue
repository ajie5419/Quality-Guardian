<script lang="ts" setup>
import { AuthPageLayout } from '@vben/layouts';
import { preferences } from '@vben/preferences';

import { $t } from '#/locales';
import { AUTH_BRAND_NAME } from '#/utils/auth-brand';

// Every entry (QMS or a bridge client) sees the same shared-login branding.
</script>

<template>
  <AuthPageLayout
    :app-name="AUTH_BRAND_NAME"
    :logo="preferences.logo.source"
    :page-description="$t('authentication.pageDesc')"
    :page-title="AUTH_BRAND_NAME"
  >
    <!-- 自定义工具栏 -->
    <!-- <template #toolbar></template> -->
  </AuthPageLayout>
</template>
