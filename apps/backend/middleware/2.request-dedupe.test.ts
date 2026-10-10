import { getHeader, getRequestURL, readBody, setResponseStatus } from 'h3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import dedupeMiddleware from '~/middleware/2.request-dedupe';

vi.mock('h3', () => ({
  defineEventHandler: (handler: unknown) => handler,
  getHeader: vi.fn(),
  getRequestIP: vi.fn(),
  getRequestURL: vi.fn(),
  readBody: vi.fn(),
  setResponseStatus: vi.fn(),
}));

vi.mock('~/utils/response', () => ({
  conflictResponse: vi.fn((event: unknown, message: string) => ({
    conflict: true,
    event,
    message,
  })),
}));

const mockHeaders = vi.mocked(getHeader);
const mockURL = vi.mocked(getRequestURL);
const mockBody = vi.mocked(readBody);
const mockStatus = vi.mocked(setResponseStatus);

describe('request dedupe middleware', () => {
  const originalWindow = process.env.REQUEST_DEDUPE_WINDOW_MS;
  // The dedupe registry is module-level, so every test needs its own identity.
  let sequence = 0;

  beforeEach(() => {
    vi.clearAllMocks();
    sequence += 1;
    delete process.env.REQUEST_DEDUPE_WINDOW_MS;
    vi.useFakeTimers();
    mockHeaders.mockImplementation((_event, name) =>
      name === 'content-type' ? 'application/json' : undefined,
    );
    mockURL.mockReturnValue({ pathname: '/api/qms/work-order' } as never);
    mockBody.mockResolvedValue({ workOrderNumber: 'E2E-WO-001' });
  });

  afterEach(() => {
    vi.useRealTimers();
    if (originalWindow === undefined) {
      delete process.env.REQUEST_DEDUPE_WINDOW_MS;
    } else {
      process.env.REQUEST_DEDUPE_WINDOW_MS = originalWindow;
    }
  });

  function makeEvent() {
    return {
      method: 'POST',
      context: { userId: `user-${sequence}` },
    } as unknown as Parameters<typeof dedupeMiddleware>[0];
  }

  it('rejects an identical write inside the default window and frees it after', async () => {
    const event = makeEvent();
    expect(await dedupeMiddleware(event)).toBeUndefined();
    expect(await dedupeMiddleware(event)).toMatchObject({
      conflict: true,
      message: '请求重复，请勿重复提交',
    });
    expect(mockStatus).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(3000);
    expect(await dedupeMiddleware(event)).toBeUndefined();
  });

  it('treats a different body inside the window as a distinct write', async () => {
    const event = makeEvent();
    await dedupeMiddleware(event);
    mockBody.mockResolvedValue({ workOrderNumber: 'E2E-WO-002' });
    expect(await dedupeMiddleware(event)).toBeUndefined();
  });

  it('honours REQUEST_DEDUPE_WINDOW_MS and falls back on invalid values', async () => {
    const event = makeEvent();
    process.env.REQUEST_DEDUPE_WINDOW_MS = '1000';
    await dedupeMiddleware(event);
    await vi.advanceTimersByTimeAsync(999);
    expect(await dedupeMiddleware(event)).toMatchObject({ conflict: true });
    // A rejected duplicate must not extend the window it did not open.
    await vi.advanceTimersByTimeAsync(1);
    expect(await dedupeMiddleware(event)).toBeUndefined();

    const fallback = {
      ...makeEvent(),
      context: { userId: 'fallback-user' },
    } as unknown as Parameters<typeof dedupeMiddleware>[0];
    process.env.REQUEST_DEDUPE_WINDOW_MS = 'not-a-number';
    await dedupeMiddleware(fallback);
    await vi.advanceTimersByTimeAsync(2999);
    expect(await dedupeMiddleware(fallback)).toMatchObject({ conflict: true });
    await vi.advanceTimersByTimeAsync(1);
    expect(await dedupeMiddleware(fallback)).toBeUndefined();
  });

  it('ignores reads, non-API routes and multipart uploads', async () => {
    const read = { method: 'GET', context: { userId: 'reader-only' } };
    expect(await dedupeMiddleware(read as never)).toBeUndefined();
    expect(await dedupeMiddleware(makeEvent())).toBeUndefined();

    mockURL.mockReturnValue({ pathname: '/health' } as never);
    expect(await dedupeMiddleware(makeEvent())).toBeUndefined();

    mockURL.mockReturnValue({ pathname: '/api/qms/work-order' } as never);
    mockHeaders.mockImplementation((_event, name) =>
      name === 'content-type' ? 'multipart/form-data; boundary=x' : undefined,
    );
    expect(await dedupeMiddleware(makeEvent())).toBeUndefined();
    expect(await dedupeMiddleware(makeEvent())).toBeUndefined();
  });
});
