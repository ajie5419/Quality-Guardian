interface RequestOptions {
  url: string;
  method?: 'DELETE' | 'GET' | 'POST' | 'PUT';
  data?: Record<string, unknown>;
  header?: Record<string, string>;
}

interface ApiResponse<T = unknown> {
  code: number;
  data: T;
  error: null | string;
  message: string;
}

const API_BASE_URL = String(import.meta.env.VITE_API_BASE_URL || '').replace(
  /\/+$/,
  '',
);

function getApiBaseUrl(): string {
  if (!API_BASE_URL) {
    throw new Error('VITE_API_BASE_URL is not configured');
  }
  return API_BASE_URL;
}

function buildApiUrl(path: string): string {
  return `${getApiBaseUrl()}${path}`;
}

let isRefreshing = false;
let pendingRequests: Array<() => void> = [];

function getToken(): string {
  return uni.getStorageSync('accessToken') || '';
}

function getRefreshToken(): string {
  return uni.getStorageSync('refreshToken') || '';
}

async function refreshToken(): Promise<boolean> {
  const rt = getRefreshToken();
  if (!rt) return false;

  try {
    const res = await new Promise<UniApp.RequestSuccessCallbackResult>(
      (resolve, reject) => {
        uni.request({
          url: buildApiUrl('/api/auth/wx-refresh'),
          method: 'POST',
          data: { refreshToken: rt },
          success: resolve,
          fail: reject,
        });
      },
    );
    const body = res.data as ApiResponse<{ accessToken: string }>;
    if (body.code === 0 && body.data?.accessToken) {
      uni.setStorageSync('accessToken', body.data.accessToken);
      return true;
    }
  } catch {
    // refresh failed
  }
  return false;
}

export async function request<T = unknown>(
  options: RequestOptions,
): Promise<ApiResponse<T>> {
  const token = getToken();
  const header: Record<string, string> = {
    'Content-Type': 'application/json',
    ...options.header,
  };
  if (token) {
    header.Authorization = `Bearer ${token}`;
  }

  const res = await new Promise<UniApp.RequestSuccessCallbackResult>(
    (resolve, reject) => {
      uni.request({
        url: buildApiUrl(options.url),
        method: options.method || 'GET',
        data: options.data,
        header,
        success: resolve,
        fail: reject,
      });
    },
  );

  if (res.statusCode === 401) {
    if (!getToken()) {
      return {
        code: -1,
        data: null as T,
        error: 'unauthorized',
        message: '未登录',
      };
    }
    if (isRefreshing) {
      return new Promise((resolve) => {
        pendingRequests.push(() => resolve(request<T>(options)));
      });
    } else {
      isRefreshing = true;
      const success = await refreshToken();
      isRefreshing = false;

      if (success) {
        pendingRequests.forEach((cb) => cb());
        pendingRequests = [];
        return request<T>(options);
      } else {
        pendingRequests = [];
        uni.removeStorageSync('accessToken');
        uni.removeStorageSync('refreshToken');
        const pages = getCurrentPages();
        const currentPath = pages[pages.length - 1]?.route ?? '';
        if (!currentPath.includes('login')) {
          uni.reLaunch({ url: '/pages/login/index' });
        }
        return {
          code: -1,
          data: null as T,
          error: 'unauthorized',
          message: '登录已过期',
        };
      }
    }
  }

  return res.data as ApiResponse<T>;
}

export function uploadFile(
  filePath: string,
  formData?: Record<string, string>,
): Promise<ApiResponse<{ fileId: string; url: string }>> {
  const token = getToken();
  return new Promise((resolve, reject) => {
    uni.uploadFile({
      url: buildApiUrl('/api/qms/upload'),
      filePath,
      name: 'file',
      formData,
      header: token ? { Authorization: `Bearer ${token}` } : {},
      success: (res) => {
        resolve(
          JSON.parse(res.data) as ApiResponse<{ fileId: string; url: string }>,
        );
      },
      fail: reject,
    });
  });
}

export type { ApiResponse };
export { buildApiUrl, getApiBaseUrl };
