import { Buffer } from 'node:buffer';
import process from 'node:process';

import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '~/utils/prisma';

import { InspectionRequestDispatchService } from './inspection-request-dispatch.service';
import {
  buildInspectorMenuButtons,
  dispatchInspectionRequestViaTelegram,
  handleTelegramCallback,
  resolveTelegramDispatcherIdentity,
} from './telegram-dispatch.service';

vi.mock('~/utils/prisma', () => ({
  default: {
    qms_inspection_requests: {
      count: vi.fn(),
    },
    users: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock('./inspection-request-dispatch.service', () => ({
  InspectionRequestDispatchService: {
    dispatchRequest: vi.fn(),
  },
}));

vi.mock('~/utils/telegram-bot', () => ({
  answerCallbackQuery: vi.fn().mockResolvedValue(null),
  editMessageText: vi.fn().mockResolvedValue(null),
  sendMessage: vi.fn().mockResolvedValue(null),
  sendPhoto: vi.fn().mockResolvedValue(null),
}));

vi.mock('~/utils/telegram-qr', () => ({
  generateCloseQrImage: vi.fn().mockResolvedValue(Buffer.from('')),
}));

vi.mock('~/modules/user', () => ({
  UserService: {
    findInspectors: vi.fn(),
  },
}));

vi.mock('~/modules/system', () => ({
  SystemService: {
    getSettingValue: vi.fn().mockResolvedValue(null),
  },
}));

describe('resolveTelegramDispatcherIdentity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null and does not query DB when TELEGRAM_DISPATCHER_USERNAME is not set', async () => {
    const original = process.env.TELEGRAM_DISPATCHER_USERNAME;
    delete process.env.TELEGRAM_DISPATCHER_USERNAME;

    const result = await resolveTelegramDispatcherIdentity();

    expect(result).toBeNull();
    expect(prisma.users.findFirst).not.toHaveBeenCalled();

    if (original !== undefined)
      process.env.TELEGRAM_DISPATCHER_USERNAME = original;
  });

  it('returns null when the configured username has no active user in the DB (unknown sender)', async () => {
    process.env.TELEGRAM_DISPATCHER_USERNAME = 'ghost-dispatcher';
    vi.mocked(prisma.users.findFirst).mockResolvedValue(null as never);

    const result = await resolveTelegramDispatcherIdentity();

    expect(result).toBeNull();
    expect(prisma.users.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { isDeleted: false, username: 'ghost-dispatcher' },
      }),
    );
  });

  it('returns a real user identity when the configured username maps to an active DB user', async () => {
    process.env.TELEGRAM_DISPATCHER_USERNAME = 'telegram-bot';
    vi.mocked(prisma.users.findFirst).mockResolvedValue({
      id: 'user-tg-1',
      realName: 'Telegram Bot',
      username: 'telegram-bot',
    } as never);

    const result = await resolveTelegramDispatcherIdentity();

    expect(result).toEqual({
      id: 'user-tg-1',
      realName: 'Telegram Bot',
      roles: [],
      username: 'telegram-bot',
    });
  });

  it('falls back to username as realName when realName is null', async () => {
    process.env.TELEGRAM_DISPATCHER_USERNAME = 'telegram-bot';
    vi.mocked(prisma.users.findFirst).mockResolvedValue({
      id: 'user-tg-1',
      realName: null,
      username: 'telegram-bot',
    } as never);

    const result = await resolveTelegramDispatcherIdentity();

    expect(result?.realName).toBe('telegram-bot');
  });
});

describe('dispatchInspectionRequestViaTelegram', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws FORBIDDEN and does NOT call dispatchRequest when dispatcher identity cannot be resolved (unknown/unconfigured sender)', async () => {
    process.env.TELEGRAM_DISPATCHER_USERNAME = 'unknown-user';
    vi.mocked(prisma.users.findFirst).mockResolvedValue(null as never);

    await expect(
      dispatchInspectionRequestViaTelegram('req-1', 'inspector-1'),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    expect(
      InspectionRequestDispatchService.dispatchRequest,
    ).not.toHaveBeenCalled();
  });

  it('calls dispatchRequest with the resolved real user identity and null event when sender is known', async () => {
    process.env.TELEGRAM_DISPATCHER_USERNAME = 'telegram-bot';
    vi.mocked(prisma.users.findFirst).mockResolvedValue({
      id: 'user-tg-1',
      realName: 'Telegram Bot',
      username: 'telegram-bot',
    } as never);
    vi.mocked(
      InspectionRequestDispatchService.dispatchRequest,
    ).mockResolvedValue({
      inspectorName: 'Inspector One',
      requestNo: 'IR-001',
    } as never);

    const result = await dispatchInspectionRequestViaTelegram(
      'req-42',
      'inspector-99',
    );

    expect(
      InspectionRequestDispatchService.dispatchRequest,
    ).toHaveBeenCalledWith(
      null,
      'req-42',
      { inspectorId: 'inspector-99', priority: 3 },
      {
        id: 'user-tg-1',
        realName: 'Telegram Bot',
        roles: [],
        username: 'telegram-bot',
      },
    );
    expect(result).toMatchObject({ requestNo: 'IR-001' });
  });
});

describe('buildInspectorMenuButtons', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('annotates each inspector with their busy count and groups buttons into rows of 2', async () => {
    vi.mocked(prisma.qms_inspection_requests.count)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(1);

    const inspectors = [
      { id: 'u1', realName: 'Alice', username: 'alice' },
      { id: 'u2', realName: null, username: 'bob' },
      { id: 'u3', realName: 'Carol', username: 'carol' },
    ];

    const rows = await buildInspectorMenuButtons(inspectors, 'req-xyz');

    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveLength(2);
    expect(rows[1]).toHaveLength(1);
    const row0 = rows[0] as (typeof rows)[number];
    const row1 = rows[1] as (typeof rows)[number];
    expect(row0[0]).toMatchObject({
      callback_data: 'dispatch:req-xyz:u1',
      text: 'Alice (忙碌-2单)',
    });
    expect(row0[1]).toMatchObject({
      callback_data: 'dispatch:req-xyz:u2',
      text: 'bob (空闲)',
    });
    expect(row1[0]).toMatchObject({
      callback_data: 'dispatch:req-xyz:u3',
      text: 'Carol (忙碌-1单)',
    });
  });
});

describe('handleTelegramCallback routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('menu path: calls buildInspectorMenuButtons and sends inspector selection when data is "dispatch:<id>"', async () => {
    const { UserService } = await import('~/modules/user');
    const { answerCallbackQuery, sendMessage } = await import(
      '~/utils/telegram-bot'
    );
    vi.mocked(prisma.qms_inspection_requests.count).mockResolvedValue(0);
    vi.mocked(UserService.findInspectors).mockResolvedValue([
      { id: 'u1', realName: 'Alice', username: 'alice' },
    ] as never);

    await handleTelegramCallback({ data: 'dispatch:req-1', id: 'qid-1' });

    expect(answerCallbackQuery).toHaveBeenCalledWith('qid-1');
    expect(sendMessage).toHaveBeenCalledWith('选择检验员:', expect.any(Array));
    expect(
      InspectionRequestDispatchService.dispatchRequest,
    ).not.toHaveBeenCalled();
  });

  it('dispatch path: calls dispatchInspectionRequestViaTelegram when data is "dispatch:<id>:<inspectorId>"', async () => {
    process.env.TELEGRAM_DISPATCHER_USERNAME = 'bot-user';
    vi.mocked(prisma.users.findFirst).mockResolvedValue({
      id: 'u-bot',
      realName: 'Bot User',
      username: 'bot-user',
    } as never);
    vi.mocked(
      InspectionRequestDispatchService.dispatchRequest,
    ).mockResolvedValue({
      inspectorName: 'Alice',
      requestNo: 'IR-007',
    } as never);

    const { answerCallbackQuery } = await import('~/utils/telegram-bot');

    await handleTelegramCallback({
      data: 'dispatch:req-2:inspector-5',
      id: 'qid-2',
      message: { message_id: 99 },
    });

    expect(
      InspectionRequestDispatchService.dispatchRequest,
    ).toHaveBeenCalledWith(
      null,
      'req-2',
      { inspectorId: 'inspector-5', priority: 3 },
      expect.objectContaining({ id: 'u-bot' }),
    );
    expect(answerCallbackQuery).toHaveBeenCalledWith('qid-2', '已派单给 Alice');
  });

  it('dispatch path error: answers callback with error message on failure', async () => {
    process.env.TELEGRAM_DISPATCHER_USERNAME = 'unknown';
    vi.mocked(prisma.users.findFirst).mockResolvedValue(null as never);

    const { answerCallbackQuery } = await import('~/utils/telegram-bot');

    await handleTelegramCallback({
      data: 'dispatch:req-3:inspector-6',
      id: 'qid-3',
    });

    expect(answerCallbackQuery).toHaveBeenCalledWith(
      'qid-3',
      expect.stringContaining('派单失败:'),
    );
  });
});
