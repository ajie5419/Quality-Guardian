import { describe, expect, it } from 'vitest';

import {
  canManageInspectionIssue,
  isInspectionIssueOwner,
  mergeInspectionProcessOptions,
} from './issues';

describe('isInspectionIssueOwner', () => {
  it('allows the record creator', () => {
    expect(isInspectionIssueOwner({ createdBy: 'user-1' }, 'user-1')).toBe(
      true,
    );
  });

  it('rejects another user even when the record has an owner', () => {
    expect(isInspectionIssueOwner({ createdBy: 'user-1' }, 'user-2')).toBe(
      false,
    );
  });

  it('rejects records without an explicit creator', () => {
    expect(isInspectionIssueOwner({}, 'user-1')).toBe(false);
  });
});

describe('canManageInspectionIssue', () => {
  it('allows an administrator to manage historical system records', () => {
    expect(
      canManageInspectionIssue(
        { createdBy: 'system' },
        { id: 'admin-1', roles: ['super_admin'] },
      ),
    ).toBe(true);
  });

  it('does not grant administrator access to similarly named roles', () => {
    expect(
      canManageInspectionIssue(
        { createdBy: 'user-1' },
        { id: 'user-2', roles: ['administrator'] },
      ),
    ).toBe(false);
  });
});

describe('mergeInspectionProcessOptions', () => {
  it('keeps the first label for duplicate values', () => {
    expect(
      mergeInspectionProcessOptions(
        [{ label: '焊接', value: 'WELDING' }],
        [
          { label: 'Welding', value: 'WELDING' },
          { label: '下料', value: 'CUTTING' },
        ],
      ),
    ).toEqual([
      { label: '焊接', value: 'WELDING' },
      { label: '下料', value: 'CUTTING' },
    ]);
  });

  it('falls back to the value when the label is empty', () => {
    expect(
      mergeInspectionProcessOptions([{ label: '', value: 'WELDING' }]),
    ).toEqual([{ label: 'WELDING', value: 'WELDING' }]);
  });
});
