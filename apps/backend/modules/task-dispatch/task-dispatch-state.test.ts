import { describe, expect, it } from 'vitest';
import { BusinessError } from '~/utils/business-error';

import {
  assertTaskDispatchTransition,
  isTaskDispatchStatus,
  TASK_DISPATCH_TRANSITIONS,
} from './task-dispatch-state';

describe('task-dispatch state machine', () => {
  it('exposes a transition matrix for every known status', () => {
    expect(TASK_DISPATCH_TRANSITIONS).toEqual({
      CANCELLED: [],
      COMPLETED: [],
      DISPATCHED: ['PROCESSING', 'COMPLETED', 'CANCELLED'],
      PENDING: ['DISPATCHED', 'PROCESSING', 'COMPLETED', 'CANCELLED'],
      PROCESSING: ['COMPLETED', 'CANCELLED'],
    });
  });

  it('recognizes canonical task statuses and rejects unknown values', () => {
    expect(isTaskDispatchStatus('PENDING')).toBe(true);
    expect(isTaskDispatchStatus('pending')).toBe(true);
    expect(isTaskDispatchStatus('DONE')).toBe(false);
    expect(isTaskDispatchStatus(undefined)).toBe(false);
  });

  it('allows forward transitions and same-state no-ops', () => {
    expect(() =>
      assertTaskDispatchTransition('PENDING', 'PROCESSING'),
    ).not.toThrow();
    expect(() =>
      assertTaskDispatchTransition('PENDING', 'COMPLETED'),
    ).not.toThrow();
    expect(() =>
      assertTaskDispatchTransition('PROCESSING', 'PROCESSING'),
    ).not.toThrow();
    expect(() =>
      assertTaskDispatchTransition('pending', 'processing'),
    ).not.toThrow();
  });

  it('rejects illegal jumps with 409 CONFLICT', () => {
    expect(() =>
      assertTaskDispatchTransition('COMPLETED', 'PENDING'),
    ).toThrowError(
      expect.objectContaining({ code: 'CONFLICT', httpStatus: 409 }),
    );
    expect(() =>
      assertTaskDispatchTransition('PROCESSING', 'PENDING'),
    ).toThrowError(
      expect.objectContaining({ code: 'CONFLICT', httpStatus: 409 }),
    );
    expect(() =>
      assertTaskDispatchTransition('CANCELLED', 'COMPLETED'),
    ).toThrowError(
      expect.objectContaining({ code: 'CONFLICT', httpStatus: 409 }),
    );
  });

  it('fails closed on unknown current or next status with 400', () => {
    expect(() => assertTaskDispatchTransition('PENDING', 'DONE')).toThrowError(
      expect.objectContaining({ code: 'BAD_REQUEST', httpStatus: 400 }),
    );
    expect(() =>
      assertTaskDispatchTransition('UNKNOWN', 'PENDING'),
    ).toThrowError(
      expect.objectContaining({ code: 'BAD_REQUEST', httpStatus: 400 }),
    );
    expect(() => assertTaskDispatchTransition('PENDING', 'DONE')).toThrowError(
      BusinessError,
    );
  });
});
