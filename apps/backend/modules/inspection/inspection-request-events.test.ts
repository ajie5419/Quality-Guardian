import type { ServerResponse } from 'node:http';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const redisMocks = vi.hoisted(() => ({
  disconnect: vi.fn(),
  on: vi.fn(),
  publish: vi.fn(),
  subscribe: vi.fn(),
}));

vi.mock('~/utils/logger', () => ({
  createModuleLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
  }),
}));

vi.mock('~/utils/redis', () => ({
  redis: {
    getClient: vi.fn(() => ({
      duplicate: () => ({
        disconnect: redisMocks.disconnect,
        on: redisMocks.on,
        subscribe: redisMocks.subscribe,
      }),
      publish: redisMocks.publish,
    })),
  },
}));

async function loadModule() {
  return import('./inspection-request-events');
}

function createResponse() {
  return {
    destroyed: false,
    writableEnded: false,
    write: vi.fn(),
  } as unknown as ServerResponse & { write: ReturnType<typeof vi.fn> };
}

describe('inspectionRequestEvents', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    redisMocks.subscribe.mockResolvedValue(1);
    redisMocks.publish.mockResolvedValue(1);
  });

  it('broadcasts created request events to local SSE clients and Redis', async () => {
    const {
      publishInspectionRequestCreated,
      subscribeInspectionRequestEvents,
    } = await loadModule();
    const response = createResponse();
    subscribeInspectionRequestEvents(response);

    const request = { id: 'request-1' } as any;
    publishInspectionRequestCreated(request);

    await vi.waitFor(() => {
      expect(redisMocks.publish).toHaveBeenCalled();
    });
    expect(response.write).toHaveBeenCalledWith(': connected\n\n');
    expect(response.write).toHaveBeenCalledWith(
      'event: inspection-request-created\n',
    );
    expect(response.write).toHaveBeenCalledWith(
      `data: ${JSON.stringify({
        request,
        type: 'inspection-request-created',
      })}\n\n`,
    );
  });

  it('broadcasts Redis events from other backend instances to local SSE clients', async () => {
    const { subscribeInspectionRequestEvents } = await loadModule();
    const response = createResponse();
    subscribeInspectionRequestEvents(response);

    await vi.waitFor(() => {
      expect(redisMocks.subscribe).toHaveBeenCalledWith(
        'qms:inspection-requests:events',
      );
    });

    const messageHandler = redisMocks.on.mock.calls.find(
      ([eventName]) => eventName === 'message',
    )?.[1] as (channel: string, message: string) => void;

    const request = { id: 'request-2' };
    messageHandler(
      'qms:inspection-requests:events',
      JSON.stringify({
        event: { request, type: 'inspection-request-created' },
        sourceId: 'another-instance',
      }),
    );

    expect(response.write).toHaveBeenCalledWith(
      'event: inspection-request-created\n',
    );
    expect(response.write).toHaveBeenCalledWith(
      `data: ${JSON.stringify({
        request,
        type: 'inspection-request-created',
      })}\n\n`,
    );
  });
});
