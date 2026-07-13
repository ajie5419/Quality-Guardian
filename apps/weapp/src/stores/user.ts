import { computed, ref } from 'vue';

import { getPermissionCodes, wxBind, wxLogin } from '@/api/auth';
import { request } from '@/api/request';
import { defineStore } from 'pinia';

export const useUserStore = defineStore('user', () => {
  const userInfo = ref<null | {
    id: string;
    realName: string;
    roles: string[];
    username: string;
  }>(null);
  const permissionCodes = ref<string[]>([]);
  let permissionRequest: null | Promise<void> = null;

  const isLoggedIn = computed(() => !!uni.getStorageSync('accessToken'));

  function restoreAuth() {
    const token = uni.getStorageSync('accessToken');
    const info = uni.getStorageSync('userInfo');
    if (token && info) {
      userInfo.value = JSON.parse(info);
      const storedCodes = uni.getStorageSync('permissionCodes');
      permissionCodes.value = Array.isArray(storedCodes) ? storedCodes : [];
      void loadPermissionCodes(true);
      return true;
    }
    return false;
  }

  async function loadPermissionCodes(force = false) {
    if (!isLoggedIn.value) {
      permissionCodes.value = [];
      return;
    }
    if (!force && permissionCodes.value.length > 0) return;
    if (permissionRequest) return permissionRequest;
    permissionRequest = (async () => {
      try {
        const res = await getPermissionCodes();
        if (res.code === 0 && Array.isArray(res.data)) {
          permissionCodes.value = res.data;
          uni.setStorageSync('permissionCodes', res.data);
        }
      } catch {
        // Keep the cached permissions for transient network failures.
      } finally {
        permissionRequest = null;
      }
    })();
    return permissionRequest;
  }

  function hasPermission(code: string) {
    return permissionCodes.value.includes(code);
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
    await loadPermissionCodes(true);
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
    await loadPermissionCodes(true);
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
    uni.removeStorageSync('permissionCodes');
    userInfo.value = null;
    permissionCodes.value = [];
    uni.reLaunch({ url: '/pages/login/index' });
  }

  return {
    userInfo,
    permissionCodes,
    isLoggedIn,
    checkAuth,
    login,
    bind,
    logout,
    restoreAuth,
    loadPermissionCodes,
    hasPermission,
  };
});
