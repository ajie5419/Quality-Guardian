import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eventBus } from '~/utils/event-bus';

const { mockLoggerWarn } = vi.hoisted(() => ({
  mockLoggerWarn: vi.fn(),
}));

vi.mock('~/utils/logger', () => ({
  createModuleLogger: () => ({ warn: mockLoggerWarn }),
}));

describe('eventBus', () => {
  beforeEach(() => {
    eventBus.reset();
    vi.clearAllMocks();
  });

  it('emits payload to subscribed handlers', async () => {
    const handler = vi.fn();
    eventBus.on('after_sales.changed', handler);

    eventBus.emit('after_sales.changed', {
      supplierBrands: ['Acme'],
      supplierIds: ['supplier-1'],
    });
    await new Promise((resolve) => setImmediate(resolve));

    expect(handler).toHaveBeenCalledWith({
      supplierBrands: ['Acme'],
      supplierIds: ['supplier-1'],
    });
  });

  it('isolates handler errors from the emitter', async () => {
    eventBus.on('after_sales.changed', () => {
      throw new Error('handler boom');
    });
    const ok = vi.fn();
    eventBus.on('after_sales.changed', ok);

    expect(() =>
      eventBus.emit('after_sales.changed', {
        supplierBrands: [],
        supplierIds: [],
      }),
    ).not.toThrow();
    await new Promise((resolve) => setImmediate(resolve));
    expect(ok).toHaveBeenCalled();
  });

  it('routes async rejection to the bus logger without unhandled rejection', async () => {
    eventBus.on('after_sales.changed', async () => {
      throw new Error('async boom');
    });

    eventBus.emit('after_sales.changed', {
      supplierBrands: ['X'],
      supplierIds: ['supplier-1'],
    });
    await new Promise((resolve) => setImmediate(resolve));

    expect(mockLoggerWarn).toHaveBeenCalledOnce();
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      {
        err: expect.objectContaining({ message: 'async boom' }),
        event: 'after_sales.changed',
      },
      'event listener handler failed',
    );
  });
});
