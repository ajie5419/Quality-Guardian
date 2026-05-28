import { createHash } from 'node:crypto';
import process from 'node:process';

import { defineEventHandler, getMethod, getQuery } from 'h3';

const WX_TOKEN = process.env.WX_PUSH_TOKEN || 'qms_wx_token';

export default defineEventHandler(async (event) => {
  const method = getMethod(event);

  if (method === 'GET') {
    const query = getQuery(event);
    const { echostr, nonce, signature, timestamp } = query as Record<
      string,
      string
    >;
    const arr = [WX_TOKEN, timestamp, nonce].sort();
    const hash = createHash('sha1').update(arr.join('')).digest('hex');
    if (hash === signature) {
      return echostr;
    }
    return 'signature mismatch';
  }

  return 'ok';
});
