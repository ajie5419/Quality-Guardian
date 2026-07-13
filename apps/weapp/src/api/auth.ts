import { request } from './request';

interface WxLoginResult {
  needBind?: boolean;
  sessionToken?: string;
  accessToken?: string;
  refreshToken?: string;
  userPayload?: {
    id: string;
    realName: string;
    roles: string[];
    username: string;
  };
}

interface WxBindResult {
  accessToken: string;
  refreshToken: string;
  userPayload: {
    id: string;
    realName: string;
    roles: string[];
    username: string;
  };
}

export function wxLogin(code: string) {
  return request<WxLoginResult>({
    url: '/api/auth/wx-login',
    method: 'POST',
    data: { code },
  });
}

export function wxBind(
  sessionToken: string,
  username: string,
  password: string,
) {
  return request<WxBindResult>({
    url: '/api/auth/wx-bind',
    method: 'POST',
    data: { sessionToken, username, password },
  });
}

export function getPermissionCodes() {
  return request<string[]>({ url: '/api/auth/codes', method: 'GET' });
}
