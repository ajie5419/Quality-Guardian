import { describe, expect, it, vi } from 'vitest';
import { eventBus } from '~/utils/event-bus';

describe('eventBus', () => {
  it('emits payload to subscribed handlers', async () => {
    eventBus.reset();
    const handler = vi.fn();
    eventBus.on('after_sales.changed', handler);

    eventBus.emit('after_sales.changed', { supplierBrands: ['Acme'] });
    await new Promise((resolve) => setImmediate(resolve));

    expect(handler).toHaveBeenCalledWith({ supplierBrands: ['Acme'] });
  });

  it('isolates handler errors from the emitter', async () => {
    eventBus.reset();
    eventBus.on('after_sales.changed', () => {
      throw new Error('handler boom');
    });
    const ok = vi.fn();
    eventBus.on('after_sales.changed', ok);

    expect(() =>
      eventBus.emit('after_sales.changed', { supplierBrands: [] }),
    ).not.toThrow();
    await new Promise((resolve) => setImmediate(resolve));
    expect(ok).toHaveBeenCalled();
  });

  it('routes async rejection to the bus logger without unhandled rejection', async () => {
    eventBus.reset();
    eventBus.on('after_sales.changed', async () => {
      throw new Error('async boom');
    });

    eventBus.emit('after_sales.changed', { supplierBrands: ['X'] });
    await new Promise((resolve) => setImmediate(resolve));
  });
});
