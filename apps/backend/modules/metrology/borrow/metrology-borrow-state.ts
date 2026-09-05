import { BusinessError } from '~/utils/business-error';

// Borrow-domain state vocabulary (METROLOGY-BORROW-001).
//
// measuring_instruments.borrowStatus is the authoritative mutex source and
// keeps the compact vocabulary exposed by @qgs/shared
// (AVAILABLE | BORROWED | RETURN_PENDING). OVERDUE is a borrow-record
// flow-state display variant, never an instrument state, so the two tables
// cannot drift: instrument === AVAILABLE iff no active borrow record exists.
export const INSTRUMENT_BORROW_STATUS = {
  AVAILABLE: 'AVAILABLE',
  BORROWED: 'BORROWED',
  RETURN_PENDING: 'RETURN_PENDING',
} as const;

export const BORROW_RECORD_STATUS = {
  BORROWED: 'BORROWED',
  OVERDUE: 'OVERDUE',
  RETURN_PENDING: 'RETURN_PENDING',
  RETURNED: 'RETURNED',
} as const;

export const ACTIVE_BORROW_RECORD_STATUSES: readonly string[] = [
  BORROW_RECORD_STATUS.BORROWED,
  BORROW_RECORD_STATUS.OVERDUE,
  BORROW_RECORD_STATUS.RETURN_PENDING,
];

// Every borrow-domain state transition runs through a CAS update keyed by the
// expected current state. A failed claim raises 409 CONFLICT so concurrent
// borrows/returns cannot both pass their precondition check.
export function throwBorrowConflict(message: string): never {
  throw new BusinessError('CONFLICT', message, 409);
}
