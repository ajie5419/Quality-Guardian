/**
 * 该文件可自行根据业务逻辑进行调整
 */
import type { RequestClientOptions } from '@vben/request';

import { useAppConfig } from '@vben/hooks';
import { preferences } from '@vben/preferences';
import {
  authenticateResponseInterceptor,
  defaultResponseInterceptor,
  errorMessageResponseInterceptor,
  RequestClient,
} from '@vben/request';
import { useAccessStore } from '@vben/stores';

import { message, notification } from 'ant-design-vue';

import { useAuthStore } from '#/store';

import { refreshTokenApi } from './core';

const { apiURL } = useAppConfig(import.meta.env, import.meta.env.PROD);

function createRequestClient(baseURL: string, options?: RequestClientOptions) {
  const client = new RequestClient({
    ...options,
    baseURL,
  });

  /**
   * 重新认证逻辑
   */
  async function doReAuthenticate() {
    console.warn('Access token or refresh token is invalid or expired. ');
    const accessStore = useAccessStore();
    const authStore = useAuthStore();
    accessStore.setAccessToken(null);
    if (
      preferences.app.loginExpiredMode === 'modal' &&
      accessStore.isAccessChecked
    ) {
      accessStore.setLoginExpired(true);
    } else {
      await authStore.logout();
    }
  }

  /**
   * 刷新token逻辑
   */
  async function doRefreshToken() {
    const accessStore = useAccessStore();
    const resp = await refreshTokenApi();
    const newToken = resp.data;
    accessStore.setAccessToken(newToken);
    return newToken;
  }

  function formatToken(token: null | string) {
    return token ? `Bearer ${token}` : null;
  }

  // 请求头处理
  client.addRequestInterceptor({
    fulfilled: async (config) => {
      const accessStore = useAccessStore();

      config.headers.Authorization = formatToken(accessStore.accessToken);
      config.headers['Accept-Language'] = preferences.app.locale;

      // 过滤无效参数 (undefined, null, '')，避免 URL 中出现 key=undefined
      if (config.params) {
        const cleanParams = Object.entries(config.params).filter(
          ([_, v]) => v !== undefined && v !== null && v !== '',
        );
        config.params = Object.fromEntries(cleanParams);
      }

      return config;
    },
  });

  // 处理返回的响应数据格式
  client.addResponseInterceptor(
    defaultResponseInterceptor({
      codeField: 'code',
      dataField: 'data',
      successCode: 0,
    }),
  );

  // token过期的处理
  client.addResponseInterceptor(
    authenticateResponseInterceptor({
      client,
      doReAuthenticate,
      doRefreshToken,
      enableRefreshToken: preferences.app.enableRefreshToken,
      formatToken,
    }),
  );

  // 通用的错误处理,如果没有进入上面的错误处理逻辑，就会进入这里
  client.addResponseInterceptor(
    errorMessageResponseInterceptor((msg: string, error: unknown) => {
      // 这里可以根据业务进行定制,你可以拿到 error 内的信息进行定制化处理，根据不同的 code 做不同的提示，而不是直接使用 message.error 提示 msg
      // 当前mock接口返回 of the 错误字段是 error 或者 message
      const err = error as {
        config?: any;
        response?: {
          data?: { code?: number; error?: string; message?: string };
          status?: number;
        };
      };
      const responseData = err?.response?.data ?? {};
      const status = err?.response?.status;
      const code = responseData?.code;
      const errorMessage = responseData?.error ?? responseData?.message ?? '';

      // 情况 A: 业务错误 (Code 1000-4999) -> 使用 message (轻型提示)
      if (code && code >= 1000 && code < 5000) {
        message.warning(errorMessage || msg);
        return;
      }

      // 情况 B: 系统级错误 (500, 502, 504) 或 Code >= 5000 -> 使用 notification (强对比/持久)
      if (status === 500 || (code && code >= 5000)) {
        notification.error({
          description: errorMessage || msg || '服务器响应异常，请稍后重试',
          message: '系统错误',
          duration: 10, // 提示停留更久
        });
        return;
      }

      // 情况 C: 网络异常/超时 (没有 status)
      if (!status) {
        notification.warning({
          description: '网络连接异常或请求超时，请检查您的网络设置',
          message: '网络错误',
        });
        return;
      }

      // 兜底提示
      message.error(errorMessage || msg);
    }),
  );

  return client;
}

export const requestClient = createRequestClient(apiURL, {
  responseReturn: 'data',
});

export const baseRequestClient = new RequestClient({ baseURL: apiURL });
