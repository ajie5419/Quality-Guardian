import process from 'node:process';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { WxSubscribeMessageService } from './wx-subscribe-message.service';

vi.mock('~/utils/logger', () => ({
  createModuleLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  })),
}));

vi.mock('~/utils/redis', () => ({
  redis: {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
  },
}));

describe('wxSubscribeMessageService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.WX_DISPATCH_SUBSCRIBE_TEMPLATE_ID;
    process.env.WX_APPID = 'appid';
    process.env.WX_APP_SECRET = 'secret';
    globalThis.fetch = vi.fn();
  });

  it('skips dispatch notification when template id is not configured', async () => {
    await WxSubscribeMessageService.sendDispatchAssigned({
      dispatcher: 'Dispatcher',
      openid: 'openid',
      partName: 'Part',
      projectName: 'Project',
      requestNo: 'IR-1',
      workOrderNumber: 'WO-1',
    });

    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('sends dispatch subscribe message when openid and template are configured', async () => {
    process.env.WX_DISPATCH_SUBSCRIBE_TEMPLATE_ID = 'template-id';
    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce({
        json: vi.fn().mockResolvedValue({
          access_token: 'access-token',
          expires_in: 7200,
        }),
      } as never)
      .mockResolvedValueOnce({
        json: vi.fn().mockResolvedValue({ errcode: 0 }),
      } as never);

    await WxSubscribeMessageService.sendDispatchAssigned({
      dispatcher: 'Dispatcher',
      openid: 'openid',
      partName: 'Part',
      projectName: 'Project',
      requestNo: 'IR-1',
      workOrderNumber: 'WO-1',
    });

    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    expect(globalThis.fetch).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('/cgi-bin/message/subscribe/send'),
      expect.objectContaining({
        body: expect.stringContaining('"touser":"openid"'),
        method: 'POST',
      }),
    );
    const body = JSON.parse(
      String(vi.mocked(globalThis.fetch).mock.calls[1]?.[1]?.body),
    ) as { data: Record<string, { value: string }> };
    expect(body.data.thing12.value).toBe('Part');
    expect(body.data.thing24.value).toBe('Project');
    expect(body.data.thing23.value).toBe('Dispatcher');
    expect(body.data.character_string13.value).toBe('WO-1');
    expect(body.data.time4.value).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  });
});
