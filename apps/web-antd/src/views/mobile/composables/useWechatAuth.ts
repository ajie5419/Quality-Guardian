import { ref } from 'vue';

import { useAccessStore } from '@vben/stores';

import { requestClient } from '#/api/request';

const CORP_ID = import.meta.env.VITE_WECHAT_WORK_CORP_ID || '';
const AGENT_ID = import.meta.env.VITE_WECHAT_WORK_AGENT_ID || '1000002';
const MOBILE_TOKEN_KEY = 'mobile-token';
const MOBILE_USER_KEY = 'mobile-user';

interface MobileAuthUser {
  id: string;
  realName: string;
  role: string;
}

interface MobileAuthResult {
  token: string;
  user: MobileAuthUser;
}

const isAuthed = ref(false);
const loading = ref(true);
const user = ref<MobileAuthUser | null>(null);

function saveMobileSession(token: string, nextUser: MobileAuthUser) {
  localStorage.setItem(MOBILE_TOKEN_KEY, token);
  localStorage.setItem(MOBILE_USER_KEY, JSON.stringify(nextUser));
  useAccessStore().setAccessToken(token);
}

function restoreMobileUser() {
  const raw = localStorage.getItem(MOBILE_USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as MobileAuthUser;
  } catch {
    localStorage.removeItem(MOBILE_USER_KEY);
    return null;
  }
}

export function useWechatAuth() {
  async function auth() {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');

    if (!code) {
      const redirectTarget =
        window.location.href.split('?')[0] || window.location.href;
      const redirectUri = encodeURIComponent(redirectTarget);
      const authUrl = `https://open.weixin.qq.com/connect/oauth2/authorize?appid=${CORP_ID}&redirect_uri=${redirectUri}&response_type=code&scope=snsapi_privateinfo&agentid=${AGENT_ID}#wechat_redirect`;
      window.location.href = authUrl;
      return;
    }

    try {
      const res = await requestClient.post<MobileAuthResult>(
        '/auth/wechat-work',
        { code },
      );
      if (res?.token) {
        saveMobileSession(res.token, res.user);
        user.value = res.user;
        isAuthed.value = true;
      }
    } finally {
      loading.value = false;
    }
  }

  function checkExistingToken() {
    const token = localStorage.getItem(MOBILE_TOKEN_KEY);
    if (!token) return false;

    useAccessStore().setAccessToken(token);
    user.value = restoreMobileUser();
    isAuthed.value = true;
    loading.value = false;
    return true;
  }

  return { auth, checkExistingToken, isAuthed, loading, user };
}
