import process from 'node:process';

import { createModuleLogger } from '~/utils/logger';
import { redis } from '~/utils/redis';

const logger = createModuleLogger('wx-subscribe-message');

const ACCESS_TOKEN_CACHE_KEY = 'wx:miniapp:access-token';
const ACCESS_TOKEN_TTL_SECONDS = 7000;

type SubscribeMessageValue = {
  value: string;
};

type SubscribeMessageData = Record<string, SubscribeMessageValue>;

type AccessTokenResponse = {
  access_token?: string;
  errcode?: number;
  errmsg?: string;
  expires_in?: number;
};

type SendMessageResponse = {
  errcode?: number;
  errmsg?: string;
};

function getWxAppId() {
  return process.env.WX_APPID || '';
}

function getWxAppSecret() {
  return process.env.WX_APP_SECRET || '';
}

function getDispatchTemplateId() {
  return process.env.WX_DISPATCH_SUBSCRIBE_TEMPLATE_ID || '';
}

function truncate(value: string, maxLength: number) {
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

function formatDateTime(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function buildDispatchMessageData(input: {
  dispatcher: string;
  partName: string;
  projectName: string;
  requestNo: string;
  workOrderNumber: string;
}): SubscribeMessageData {
  const fields = {
    dispatcher: process.env.WX_DISPATCH_SUBSCRIBE_FIELD_DISPATCHER || 'thing23',
    projectName:
      process.env.WX_DISPATCH_SUBSCRIBE_FIELD_PROJECT_NAME || 'thing24',
    task: process.env.WX_DISPATCH_SUBSCRIBE_FIELD_TASK || 'thing12',
    updatedAt: process.env.WX_DISPATCH_SUBSCRIBE_FIELD_UPDATED_AT || 'time4',
    workTicketNo:
      process.env.WX_DISPATCH_SUBSCRIBE_FIELD_WORK_TICKET_NO ||
      'character_string13',
  };
  return {
    [fields.task]: {
      value: truncate(
        input.partName || input.workOrderNumber || '检验任务',
        20,
      ),
    },
    [fields.projectName]: {
      value: truncate(input.projectName || input.workOrderNumber || '项目', 20),
    },
    [fields.dispatcher]: {
      value: truncate(input.dispatcher || '系统派单', 20),
    },
    [fields.workTicketNo]: {
      value: truncate(input.workOrderNumber || input.requestNo || '无', 32),
    },
    [fields.updatedAt]: { value: formatDateTime(new Date()) },
  };
}

async function getAccessToken() {
  const cached = await redis.get<string>(ACCESS_TOKEN_CACHE_KEY);
  if (cached) return cached;

  const appid = getWxAppId();
  const secret = getWxAppSecret();
  if (!appid || !secret) {
    logger.warn('skip wx subscribe message: WX_APPID/WX_APP_SECRET missing');
    return '';
  }

  try {
    const url = new URL('https://api.weixin.qq.com/cgi-bin/token');
    url.searchParams.set('grant_type', 'client_credential');
    url.searchParams.set('appid', appid);
    url.searchParams.set('secret', secret);
    const response = await fetch(url);
    const body = (await response.json()) as AccessTokenResponse;
    if (!body.access_token) {
      logger.warn(
        { errcode: body.errcode, errmsg: body.errmsg },
        'fetch wx access token failed',
      );
      return '';
    }

    await redis.set(
      ACCESS_TOKEN_CACHE_KEY,
      body.access_token,
      Math.min(
        ACCESS_TOKEN_TTL_SECONDS,
        Math.max(60, Number(body.expires_in || ACCESS_TOKEN_TTL_SECONDS) - 200),
      ),
    );
    return body.access_token;
  } catch {
    logger.warn('fetch wx access token error');
    return '';
  }
}

export const WxSubscribeMessageService = {
  async sendDispatchAssigned(input: {
    dispatcher: string;
    openid?: null | string;
    page?: string;
    partName: string;
    projectName: string;
    requestNo: string;
    workOrderNumber: string;
  }) {
    const templateId = getDispatchTemplateId();
    if (!templateId) {
      logger.debug(
        'skip wx dispatch subscribe message: template not configured',
      );
      return;
    }
    if (!input.openid) {
      logger.info(
        'skip wx dispatch subscribe message: inspector has no openid',
      );
      return;
    }

    try {
      const accessToken = await getAccessToken();
      if (!accessToken) return;
      const response = await fetch(
        `https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=${accessToken}`,
        {
          body: JSON.stringify({
            data: buildDispatchMessageData(input),
            miniprogram_state:
              process.env.WX_SUBSCRIBE_MINIPROGRAM_STATE || 'formal',
            page: input.page || 'pages/tasks/index',
            template_id: templateId,
            touser: input.openid,
          }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        },
      );
      const body = (await response.json()) as SendMessageResponse;
      if (body.errcode) {
        logger.warn(
          { errcode: body.errcode, errmsg: body.errmsg },
          'send wx dispatch subscribe message failed',
        );
      }
    } catch (error) {
      logger.warn({ err: error }, 'send wx dispatch subscribe message error');
    }
  },
};
