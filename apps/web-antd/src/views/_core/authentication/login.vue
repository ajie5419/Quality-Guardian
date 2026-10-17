<script lang="ts" setup>
import type { VbenFormSchema } from '@vben/common-ui';

import { computed } from 'vue';
import { useRoute } from 'vue-router';

import { AuthenticationLogin, z } from '@vben/common-ui';
import { $t } from '@vben/locales';

import { useIdentityClientName } from '#/composables/useIdentityClientName';
import { useAuthStore } from '#/store';
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
const title = computed(() => {
  if (!isBridge.value) return '';
  return bridgeName.value ? `登录 ${bridgeName.value}` : '登录';
});
const subTitle = computed(() => (isBridge.value ? '使用 QMS 账号登录' : ''));

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
    :show-register="!isBridge"
    :show-remember-me="false"
    :show-third-party-login="false"
    :sub-title="subTitle"
    :title="title"
    @submit="authStore.authLogin"
  />
</template>
