import { EventEmitter } from 'node:events';

import { createModuleLogger } from '~/utils/logger';

const logger = createModuleLogger('event-bus');

/**
 * In-process domain events. Single Node.js process only — when this app
 * scales to multiple instances replace the EventEmitter with Redis pub/sub
 * or BullMQ.
 *
 * Listeners must be fire-and-forget. The bus catches and logs handler
 * errors instead of letting them bubble into the emitter call site, so a
 * write path that emits an event never sees a listener exception.
 */
export interface DomainEvents {
  'after_sales.changed': {
    supplierBrands: Array<null | string | undefined>;
    supplierIds: Array<null | string | undefined>;
  };
  'inspection_issue.changed': {
    supplierIds?: Array<null | string | undefined>;
    supplierNames: Array<null | string | undefined>;
  };
  'inspection_record.changed': {
    supplierIds?: Array<null | string | undefined>;
    supplierNames: Array<null | string | undefined>;
    teamIds?: Array<null | string | undefined>;
    teamNames: Array<null | string | undefined>;
  };
}

// EventEmitter is preferred over EventTarget for typed Node-side
// fan-out. EventTarget would require manual CustomEvent wrapping.
// eslint-disable-next-line unicorn/prefer-event-target
const emitter = new EventEmitter();
emitter.setMaxListeners(50);

export const eventBus = {
  emit<K extends keyof DomainEvents>(event: K, payload: DomainEvents[K]): void {
    emitter.emit(event, payload);
  },

  on<K extends keyof DomainEvents>(
    event: K,
    handler: (payload: DomainEvents[K]) => Promise<void> | void,
  ): void {
    emitter.on(event, (payload: DomainEvents[K]) => {
      void Promise.resolve()
        .then(() => handler(payload))
        .catch((error: unknown) => {
          logger.warn({ err: error, event }, 'event listener handler failed');
        });
    });
  },

  /** test-only helper — clears all subscribers */
  reset(): void {
    emitter.removeAllListeners();
  },
};
