import { describe, expect, it } from 'vitest';

import {
  assertVehicleCommissioningIssueStatus,
  assertVehicleCommissioningIssueTransition,
  isVehicleCommissioningIssueStatus,
  VEHICLE_COMMISSIONING_ISSUE_TRANSITIONS,
} from './vehicle-commissioning-state';

describe('vehicle-commissioning state machine', () => {
  it('exposes the explicit issue transition matrix', () => {
    expect(VEHICLE_COMMISSIONING_ISSUE_TRANSITIONS).toEqual({
      CLOSED: ['OPEN'],
      IN_PROGRESS: ['OPEN', 'RESOLVED', 'CLOSED'],
      OPEN: ['IN_PROGRESS', 'RESOLVED', 'CLOSED'],
      RESOLVED: ['OPEN', 'IN_PROGRESS', 'CLOSED'],
    });
  });

  it('recognizes canonical statuses only', () => {
    expect(isVehicleCommissioningIssueStatus('CLOSED')).toBe(true);
    expect(isVehicleCommissioningIssueStatus('closed')).toBe(false);
    expect(isVehicleCommissioningIssueStatus('DONE')).toBe(false);
  });

  it('allows forward transitions and CLOSED reopen through OPEN', () => {
    expect(() =>
      assertVehicleCommissioningIssueTransition('OPEN', 'CLOSED'),
    ).not.toThrow();
    expect(() =>
      assertVehicleCommissioningIssueTransition('RESOLVED', 'CLOSED'),
    ).not.toThrow();
    expect(() =>
      assertVehicleCommissioningIssueTransition('CLOSED', 'OPEN'),
    ).not.toThrow();
  });

  it('rejects illegal jumps with 409 CONFLICT', () => {
    expect(() =>
      assertVehicleCommissioningIssueTransition('CLOSED', 'IN_PROGRESS'),
    ).toThrowError(
      expect.objectContaining({ code: 'CONFLICT', httpStatus: 409 }),
    );
    expect(() =>
      assertVehicleCommissioningIssueTransition('CLOSED', 'RESOLVED'),
    ).toThrowError(
      expect.objectContaining({ code: 'CONFLICT', httpStatus: 409 }),
    );
  });

  it('fails closed on unknown status text with 400', () => {
    expect(() => assertVehicleCommissioningIssueStatus('closed')).toThrowError(
      expect.objectContaining({ code: 'BAD_REQUEST', httpStatus: 400 }),
    );
    expect(() => assertVehicleCommissioningIssueStatus('garbage')).toThrowError(
      expect.objectContaining({ code: 'BAD_REQUEST', httpStatus: 400 }),
    );
    expect(() =>
      assertVehicleCommissioningIssueStatus(undefined),
    ).not.toThrow();
    expect(() =>
      assertVehicleCommissioningIssueTransition('OPEN', 'DONE'),
    ).toThrowError(
      expect.objectContaining({ code: 'BAD_REQUEST', httpStatus: 400 }),
    );
  });
});
