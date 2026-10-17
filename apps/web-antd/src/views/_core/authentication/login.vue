<script lang="ts" setup>
import type { VbenFormSchema } from '@vben/common-ui';

import { computed } from 'vue';
import { useRoute } from 'vue-router';

import { AuthenticationLogin, z } from '@vben/common-ui';
import { $t } from '@vben/locales';
import { preferences } from '@vben/preferences';

import { useIdentityClientName } from '#/composables/useIdentityClientName';
import { useAuthStore } from '#/store';
import { withAuthRedirect } from '#/utils/auth-brand';
import {
  identityRedirect,
  identityRedirectTarget,
} from '#/utils/identity-redirect';

defineOptions({ name: 'Login' });

const authStore = useAuthStore();
const route = useRoute();

// A bridge login is a login whose redirect is the fixed authorize page.
const isBridge = computed(() =>
  Boolean(identityRedirect(route.query.redirect)),
);
const bridgeName = useIdentityClientName(
  computed(() => identityRedirectTarget(route.query.redirect)),
);
// Same page for every entry; only the subtitle names the destination.
const subTitle = computed(() => {
  if (!isBridge.value) return `登录后进入 ${preferences.app.name}`;
  return bridgeName.value
    ? `登录后进入 ${bridgeName.value}`
    : '请输入账号密码登录';
});
const registerPath = computed(() =>
  withAuthRedirect(
    '/auth/register',
    isBridge.value ? route.query.redirect : undefined,
  ),
);

// 精简的表单配置 - 只保留用户名和密码
const formSchema = computed((): VbenFormSchema[] => {
  return [
    {
      component: 'VbenInput',
      componentProps: {
        placeholder: $t('authentication.usernameTip'),
      },
      fieldName: 'username',
      label: $t('authentication.username'),
      rules: z.string().min(1, { message: $t('authentication.usernameTip') }),
    },
    {
      component: 'VbenInputPassword',
      componentProps: {
        placeholder: $t('authentication.password'),
      },
      fieldName: 'password',
      label: $t('authentication.password'),
      rules: z.string().min(1, { message: $t('authentication.passwordTip') }),
    },
  ];
});
</script>

<template>
  <AuthenticationLogin
    :form-schema="formSchema"
    :loading="authStore.loginLoading"
    :show-code-login="false"
    :show-qrcode-login="false"
    :show-forget-password="false"
    :register-path="registerPath"
    :show-remember-me="false"
    :show-third-party-login="false"
    :sub-title="subTitle"
    @submit="authStore.authLogin"
  />
</template>
