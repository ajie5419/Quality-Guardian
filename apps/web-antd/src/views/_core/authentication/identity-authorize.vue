<script setup lang="ts">
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { useAccessStore } from '@vben/stores';

import { authorizeIdentity } from '#/api/core/identity-bridge';

const route = useRoute();
const router = useRouter();
const access = useAccessStore();
const busy = ref(false);
const error = ref('');

async function proceed() {
  if (busy.value) return;
  if (!access.accessToken) {
    await router.replace({
      path: '/auth/login',
      query: { redirect: encodeURIComponent(route.fullPath) },
    });
    return;
  }
  busy.value = true;
  error.value = '';
  try {
    const query = route.query;
    for (const key of [
      'clientId',
      'redirectUri',
      'state',
      'challenge',
      'method',
    ]) {
      if (typeof query[key] !== 'string')
        throw new Error('Invalid authorization request');
    }
    if (query.method !== 'S256')
      throw new Error('Invalid authorization method');
    const { callback } = await authorizeIdentity({
      clientId: String(query.clientId),
      redirectUri: String(query.redirectUri),
      state: String(query.state),
      challenge: String(query.challenge),
      method: 'S256',
    });
    const target = new URL(callback);
    const expected = new URL(String(query.redirectUri));
    if (
      target.origin !== expected.origin ||
      target.pathname !== expected.pathname ||
      target.username ||
      target.password ||
      target.hash
    ) {
      throw new Error('Invalid authorization callback');
    }
    window.location.replace(target.href);
  } catch {
    error.value = '授权未完成，请重新登录或从履约系统重新发起。';
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <main
    class="mx-auto mt-16 max-w-lg space-y-6 rounded-lg bg-white p-8 text-gray-900"
  >
    <h1 class="text-2xl font-semibold">登录履约系统</h1>
    <p>履约系统请求确认您的身份。继续后，将使用当前 QMS 账号登录履约系统。</p>
    <p>履约系统的查看和建单权限由履约系统单独授权。</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <button
      class="rounded bg-blue-700 px-5 py-3 text-white"
      :disabled="busy"
      @click="proceed"
    >
      {{ busy ? '正在授权…' : access.accessToken ? '继续' : '登录 QMS 后继续' }}
    </button>
  </main>
</template>
