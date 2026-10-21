import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { telegramWebhookHandler as handler } from './telegram-webhook.post.service';

const mocks = vi.hoisted(() => ({
  readBody: vi.fn(),
  callback: vi.fn(),
  getHeader: vi.fn(),
  setResponseStatus: vi.fn(),
  logError: vi.fn(),
}));

vi.mock('h3', () => ({
  defineEventHandler: (callback: unknown) => callback,
  getHeader: mocks.getHeader,
  readBody: mocks.readBody,
  setResponseStatus: mocks.setResponseStatus,
}));
vi.mock('./telegram-dispatch.service', () => ({
  handleTelegramCallback: mocks.callback,
}));
vi.mock('~/utils/api-logger', () => ({ logApiError: mocks.logError }));

const callback = { id: 'callback-id', data: 'dispatch:request-id' };
let headers: Record<string, string>;
const event = {} as Parameters<typeof handler>[0];

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('TELEGRAM_WEBHOOK_SECRET', 'test-webhook-secret');
  headers = { 'x-telegram-bot-api-secret-token': 'test-webhook-secret' };
  mocks.getHeader.mockImplementation(
    (_: unknown, name: string) => headers[name],
  );
  mocks.readBody.mockResolvedValue({ callback_query: callback });
  mocks.callback.mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllEnvs());

describe('telegram webhook authentication and input boundary', () => {
  it.each([undefined, ''])(
    'rejects an unconfigured webhook before reading its body',
    async (secret) => {
      vi.stubEnv('TELEGRAM_WEBHOOK_SECRET', secret);
      headers = {};
      mocks.readBody.mockRejectedValue(new Error('Body must not be read'));

      expect(await handler(event)).toEqual({ ok: false });
      expect(mocks.setResponseStatus).toHaveBeenCalledWith(event, 503);
      expect(mocks.readBody).not.toHaveBeenCalled();
      expect(mocks.callback).not.toHaveBeenCalled();
    },
  );

  it.each([
    undefined,
    '',
    'wrong-webhook-secret',
    'short',
    'test-webhook-secret-with-extra-bytes',
    '🔒🔒🔒',
  ])(
    'rejects a missing or incorrect secret before reading its body',
    async (secret) => {
      headers =
        secret === undefined
          ? {}
          : { 'x-telegram-bot-api-secret-token': secret };
      mocks.readBody.mockRejectedValue(new Error('Body must not be read'));

      expect(await handler(event)).toEqual({ ok: false });
      expect(mocks.setResponseStatus).toHaveBeenCalledWith(event, 401);
      expect(mocks.readBody).not.toHaveBeenCalled();
      expect(mocks.callback).not.toHaveBeenCalled();
    },
  );

  it.each([
    { 'x-telegram-bot-api-secret-token': 'test-webhook-secret' },
    { 'x-tg-secret': 'test-webhook-secret' },
    {
      'x-tg-secret': 'test-webhook-secret',
      'x-telegram-bot-api-secret-token': 'wrong',
    },
    {
      'x-tg-secret': '',
      'x-telegram-bot-api-secret-token': 'test-webhook-secret',
    },
  ])(
    'accepts either supported header using the existing precedence',
    async (providedHeaders) => {
      headers = providedHeaders;

      expect(await handler(event)).toEqual({ ok: true });
      expect(mocks.callback).toHaveBeenCalledOnce();
      expect(mocks.setResponseStatus).not.toHaveBeenCalled();
    },
  );

  it('does not override an incorrect custom header with a correct official header', async () => {
    headers['x-tg-secret'] = 'wrong';

    expect(await handler(event)).toEqual({ ok: false });
    expect(mocks.setResponseStatus).toHaveBeenCalledWith(event, 401);
    expect(mocks.callback).not.toHaveBeenCalled();
  });

  it.each([
    null,
    [],
    'not-an-object',
    { callback_query: null },
    { callback_query: {} },
    { callback_query: { id: '' } },
    { callback_query: { id: 123 } },
    { callback_query: { id: 'id', data: 123 } },
    { callback_query: { id: 'id', message: [] } },
    { callback_query: { id: 'id', message: { message_id: '123' } } },
    { callback_query: { id: 'id', message: { message_id: 1.5 } } },
  ])(
    'rejects malformed authenticated updates without executing a callback',
    async (body) => {
      mocks.readBody.mockResolvedValue(body);

      expect(await handler(event)).toEqual({ ok: false });
      expect(mocks.setResponseStatus).toHaveBeenCalledWith(event, 400);
      expect(mocks.callback).not.toHaveBeenCalled();
    },
  );

  it('rejects malformed JSON without executing a callback', async () => {
    mocks.readBody.mockRejectedValue(new SyntaxError('Invalid JSON'));

    expect(await handler(event)).toEqual({ ok: false });
    expect(mocks.setResponseStatus).toHaveBeenCalledWith(event, 400);
    expect(mocks.callback).not.toHaveBeenCalled();
    expect(mocks.logError).toHaveBeenCalled();
  });

  it.each([{}, { update_id: 1, message: { text: 'hello' } }])(
    'acknowledges authenticated updates without callbacks',
    async (body) => {
      mocks.readBody.mockResolvedValue(body);

      expect(await handler(event)).toEqual({ ok: true });
      expect(mocks.callback).not.toHaveBeenCalled();
    },
  );

  it('logs an asynchronous callback failure without an unhandled rejection', async () => {
    mocks.callback.mockRejectedValue(new Error('Callback failed'));

    expect(await handler(event)).toEqual({ ok: true });
    expect(mocks.callback).toHaveBeenCalledOnce();
    expect(mocks.logError).toHaveBeenCalled();
  });
});
