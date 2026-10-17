<script lang="ts" setup>
import { AuthPageLayout } from '@vben/layouts';
import { preferences } from '@vben/preferences';

import { $t } from '#/locales';
import { AUTH_BRAND_NAME } from '#/utils/auth-brand';

// Every entry (QMS or a bridge client) sees the same shared-login branding.
// The copyright mirrors the shared one but names the brand; the in-app
// footer keeps preferences.copyright.companyName.
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
    <template #copyright>
      <div v-if="preferences.copyright.enable" class="text-md flex-center">
        <a
          v-if="preferences.copyright.icp"
          :href="preferences.copyright.icpLink || 'javascript:void(0)'"
          class="hover:text-primary-hover mx-1"
          target="_blank"
        >
          {{ preferences.copyright.icp }}
        </a>
        Copyright © {{ preferences.copyright.date }}
        <span class="mx-1">{{ AUTH_BRAND_NAME }}</span>
      </div>
    </template>
  </AuthPageLayout>
</template>
