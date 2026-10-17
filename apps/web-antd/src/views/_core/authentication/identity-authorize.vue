<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { LOGIN_PATH } from '@vben/constants';
import { useAccessStore, useUserStore } from '@vben/stores';

import { getIdentityClientName } from '#/api/core/identity-bridge';
import { getUserInfoApi } from '#/api/core/user';
import { useAuthStore } from '#/store';
import { identityRedirect } from '#/utils/identity-redirect';

import {
  authorizeOnce,
  classifyFailure,
  parseAuthorizeQuery,
  verifiedCallback,
  wantsForcedLogin,
} from './identity-authorize-flow';

const NETWORK_ERROR = '暂时无法连接 QMS，请检查网络后重试。';

const route = useRoute();
const router = useRouter();
const access = useAccessStore();
const userStore = useUserStore();
const authStore = useAuthStore();

const busy = ref(true);
const systemName = ref('');
const error = ref('');
const accountName = ref('');

// The same authorize URL without `prompt`, so returning here never loops.
function returnPath() {
  return identityRedirect(encodeURIComponent(route.fullPath)) ?? route.path;
}

async function fail(message: string) {
  error.value = message;
  busy.value = false;
  if (accountName.value) return;
  try {
    const info = userStore.userInfo ?? (await getUserInfoApi());
    accountName.value = info.realName || info.username || '';
  } catch {
    // The account line is informational only.
  }
}

async function enter(retry = false) {
  busy.value = true;
  error.value = '';
  const request = parseAuthorizeQuery(route.query);
  if (!request) {
    await fail('登录链接无效，请回到原系统重新进入。');
    return;
  }
  try {
    const client = await getIdentityClientName(request);
    systemName.value = client.name;
  } catch (error_) {
    await fail(
      classifyFailure(error_) === 'not-found'
        ? '无法识别来源系统，请回到原系统重新进入。'
        : NETWORK_ERROR,
    );
    return;
  }
  const rejected = `未能进入 ${systemName.value}，请重试或回到原系统重新进入。`;
  let callback: string;
  try {
    ({ callback } = await authorizeOnce(request, retry));
  } catch (error_) {
    await fail(
      classifyFailure(error_) === 'network' ? NETWORK_ERROR : rejected,
    );
    return;
  }
  const target = verifiedCallback(callback, request);
  if (!target) {
    await fail(rejected);
    return;
  }
  window.location.replace(target);
}

async function switchAccount() {
  busy.value = true;
  await authStore.logout(returnPath());
}

onMounted(async () => {
  if (wantsForcedLogin(route.query)) {
    await (access.accessToken
      ? authStore.logout(returnPath())
      : router.replace({
          path: LOGIN_PATH,
          query: { redirect: encodeURIComponent(returnPath()) },
        }));
    return;
  }
  if (!access.accessToken) {
    await router.replace({
      path: LOGIN_PATH,
      query: { redirect: encodeURIComponent(route.fullPath) },
    });
    return;
  }
  await enter();
});
</script>

<template>
  <main class="mx-auto mt-16 max-w-lg space-y-6 p-8">
    <p v-if="busy" class="text-center text-lg" role="status">
      {{ systemName ? `正在进入 ${systemName}…` : '正在进入…' }}
    </p>
    <template v-else>
      <h1 class="text-2xl font-semibold">无法完成登录</h1>
      <p role="alert">{{ error }}</p>
      <p v-if="accountName">当前账号：{{ accountName }}</p>
      <div class="flex gap-3">
        <button
          class="bg-primary rounded px-5 py-2 text-white"
          type="button"
          @click="enter(true)"
        >
          重试
        </button>
        <button
          class="rounded border px-5 py-2"
          type="button"
          @click="switchAccount"
        >
          换个账号
        </button>
      </div>
    </template>
  </main>
</template>
