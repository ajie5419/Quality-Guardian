import process from 'node:process';

import { createModuleLogger } from '~/utils/logger';

const logger = createModuleLogger('WxPushNotify');

interface WxTokenResponse {
  access_token?: string;
  errcode?: number;
  errmsg?: string;
  expires_in?: number;
}

let tokenCache: null | { expiresAt: number; token: string } = null;

function isEnabled(): boolean {
  return Boolean(process.env.WX_PUSH_APPID && process.env.WX_PUSH_SECRET);
}

async function getAccessToken(): Promise<null | string> {
  if (!isEnabled()) return null;
  if (tokenCache && Date.now() < tokenCache.expiresAt) return tokenCache.token;

  const res = await fetch(
    `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${encodeURIComponent(
      process.env.WX_PUSH_APPID || '',
    )}&secret=${encodeURIComponent(process.env.WX_PUSH_SECRET || '')}`,
  );
  const data = (await res.json()) as WxTokenResponse;
  if (!data.access_token) {
    logger.error(
      { errcode: data.errcode, errmsg: data.errmsg },
      'WxPush token failed',
    );
    return null;
  }

  const expiresIn = data.expires_in || 7200;
  tokenCache = {
    expiresAt: Date.now() + Math.max(expiresIn - 200, 60) * 1000,
    token: data.access_token,
  };
  return data.access_token;
}

/**
 * 通过微信测试号模板消息推送通知
 * @param openId 用户的微信 openid（关注测试号后获得）
 * @param title 通知标题
 * @param description 通知描述（会拆分为模板字段）
 * @param url 点击跳转链接
 */
export async function notifyWechatWork(
  openId: string,
  title: string,
  description: string,
  url: string,
) {
  const token = await getAccessToken();
  if (!token) return;

  const templateId = process.env.WX_PUSH_TEMPLATE_ID || '';
  if (!templateId) return;

  try {
    const res = await fetch(
      `https://api.weixin.qq.com/cgi-bin/message/template/send?access_token=${encodeURIComponent(token)}`,
      {
        body: JSON.stringify({
          data: {
            content: { color: '#333333', value: description },
            title: { color: '#173177', value: title },
          },
          template_id: templateId,
          touser: openId,
          url,
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      },
    );
    const data = (await res.json()) as { errcode?: number; errmsg?: string };
    if (data.errcode) {
      logger.warn(
        { errcode: data.errcode, errmsg: data.errmsg },
        'WxPush notify failed',
      );
    }
  } catch (error) {
    logger.error({ err: error }, 'WxPush notify exception');
  }
}
