import { ref } from 'vue';

import { getSystemSettingApi, saveSystemSettingApi } from '#/api/system/preference';

export const QR_BASE_URL_SETTING_KEY = 'qms:qrcode:base_url';

const FALLBACK_ORIGIN = 'http://localhost:5666';

function currentOrigin() {
  return typeof window === 'undefined' ? FALLBACK_ORIGIN : window.location.origin;
}

function normalizeBase(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\/+$/, '');
}

/**
 * 二维码访问基址：优先使用系统设置中的固定地址，未配置时回退到当前 origin。
 * 让管理员无论用域名还是 IP 打开后台，生成/打印的二维码都指向同一地址。
 */
export function useQrBaseUrl() {
  const baseUrl = ref('');

  async function loadBaseUrl() {
    try {
      const value = await getSystemSettingApi(QR_BASE_URL_SETTING_KEY);
      baseUrl.value = normalizeBase(value);
    } catch {
      baseUrl.value = '';
    }
    return baseUrl.value;
  }

  async function saveBaseUrl(value: string) {
    const normalized = normalizeBase(value);
    await saveSystemSettingApi(
      QR_BASE_URL_SETTING_KEY,
      normalized,
      '二维码访问基址（域名或 IP），留空则使用当前访问地址',
    );
    baseUrl.value = normalized;
    return normalized;
  }

  function resolveOrigin() {
    return baseUrl.value || currentOrigin();
  }

  function buildEntryUrl(
    path: string,
    params: Record<string, string> = {},
  ): string {
    const origin = resolveOrigin();
    const routePath = path.startsWith('/') ? path : `/${path}`;
    const routeUrl = new URL(routePath, origin);
    for (const [key, value] of Object.entries(params)) {
      if (value) routeUrl.searchParams.set(key, value);
    }

    if (import.meta.env.VITE_ROUTER_HISTORY === 'hash') {
      return `${origin}/#${routeUrl.pathname}${routeUrl.search}`;
    }

    return routeUrl.toString();
  }

  return {
    baseUrl,
    loadBaseUrl,
    saveBaseUrl,
    resolveOrigin,
    buildEntryUrl,
  };
}
