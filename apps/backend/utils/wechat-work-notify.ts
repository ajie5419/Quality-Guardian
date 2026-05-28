import process from 'node:process';

import { createModuleLogger } from '~/utils/logger';

const logger = createModuleLogger('WechatWorkNotify');

interface WechatWorkTokenResponse {
  access_token?: string;
  errcode?: number;
  errmsg?: string;
  expires_in?: number;
}

let tokenCache: null | { expiresAt: number; token: string } = null;

function isEnabled(): boolean {
  return Boolean(
    process.env.WECHAT_WORK_CORP_ID &&
      process.env.WECHAT_WORK_SECRET &&
      process.env.WECHAT_WORK_AGENT_ID,
  );
}

async function getAccessToken(): Promise<null | string> {
  if (!isEnabled()) return null;
  if (tokenCache && Date.now() < tokenCache.expiresAt) return tokenCache.token;

  const res = await fetch(
    `https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${encodeURIComponent(
      process.env.WECHAT_WORK_CORP_ID || '',
    )}&corpsecret=${encodeURIComponent(process.env.WECHAT_WORK_SECRET || '')}`,
  );
  const data = (await res.json()) as WechatWorkTokenResponse;
  if (!data.access_token) {
    logger.error(
      { errcode: data.errcode, errmsg: data.errmsg },
      'Wechat Work token failed',
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

export async function notifyWechatWork(
  userId: string,
  title: string,
  description: string,
  url: string,
) {
  const token = await getAccessToken();
  if (!token) return;

  try {
    const res = await fetch(
      `https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${encodeURIComponent(
        token,
      )}`,
      {
        body: JSON.stringify({
          agentid: Number(process.env.WECHAT_WORK_AGENT_ID),
          msgtype: 'text_card',
          text_card: { btntxt: 'View', description, title, url },
          touser: userId,
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      },
    );
    const data = (await res.json()) as { errcode?: number; errmsg?: string };
    if (data.errcode) {
      logger.warn(
        { errcode: data.errcode, errmsg: data.errmsg },
        'Wechat Work notify failed',
      );
    }
  } catch (err) {
    logger.error({ err }, 'Wechat Work notify exception');
  }
}
