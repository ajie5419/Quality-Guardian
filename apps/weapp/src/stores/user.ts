import { computed, ref } from 'vue';

import { wxBind, wxLogin } from '@/api/auth';
import { request } from '@/api/request';
import { defineStore } from 'pinia';

export const useUserStore = defineStore('user', () => {
  const userInfo = ref<null | {
    id: string;
    realName: string;
    roles: string[];
    username: string;
  }>(null);

  const isLoggedIn = computed(() => !!uni.getStorageSync('accessToken'));

  function restoreAuth() {
    const token = uni.getStorageSync('accessToken');
    const info = uni.getStorageSync('userInfo');
    if (token && info) {
      userInfo.value = JSON.parse(info);
      return true;
    }
    return false;
  }

  function checkAuth() {
    if (restoreAuth()) return true;
    uni.reLaunch({ url: '/pages/login/index' });
    return false;
  }

  async function login() {
    const { code } = await new Promise<UniApp.LoginRes>((resolve, reject) => {
      uni.login({ success: resolve, fail: reject });
    });

    const res = await wxLogin(code);
    if (res.code !== 0) throw new Error(res.message);

    if (res.data.needBind) {
      return { needBind: true, sessionToken: res.data.sessionToken ?? '' };
    }

    uni.setStorageSync('accessToken', res.data.accessToken ?? '');
    uni.setStorageSync('refreshToken', res.data.refreshToken ?? '');
    uni.setStorageSync('userInfo', JSON.stringify(res.data.userPayload));
    userInfo.value = res.data.userPayload ?? null;
    return { needBind: false };
  }

  async function bind(
    sessionToken: string,
    username: string,
    password: string,
  ) {
    const res = await wxBind(sessionToken, username, password);
    if (res.code !== 0) throw new Error(res.message);

    uni.setStorageSync('accessToken', res.data.accessToken);
    uni.setStorageSync('refreshToken', res.data.refreshToken);
    uni.setStorageSync('userInfo', JSON.stringify(res.data.userPayload));
    userInfo.value = res.data.userPayload;
  }

  async function logout() {
    try {
      await request({ url: '/api/auth/wx-unbind', method: 'POST' });
    } catch {
      // ignore — still clear local state
    }
    uni.removeStorageSync('accessToken');
    uni.removeStorageSync('refreshToken');
    uni.removeStorageSync('userInfo');
    userInfo.value = null;
    uni.reLaunch({ url: '/pages/login/index' });
  }

  return { userInfo, isLoggedIn, checkAuth, login, bind, logout, restoreAuth };
});
