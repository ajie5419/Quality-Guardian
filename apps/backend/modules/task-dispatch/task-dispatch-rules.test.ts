import { describe, expect, it, vi } from 'vitest';

import {
  buildTaskDispatchCreateData,
  getTaskDispatchArchiveFilter,
  isTaskDispatchLevelTwo,
  normalizeTaskDispatchStatus,
  resolveTaskDispatchAssigneeCandidates,
  resolveTaskDispatchAssigneeFilter,
  resolveTaskDispatchCurrentUserId,
  resolveTaskDispatchItpProjectIdForValidation,
  resolveTaskDispatchLevel,
  resolveTaskDispatchParentIdForPromotion,
  resolveTaskDispatchStatusFilter,
  resolveTaskDispatchUserId,
} from './task-dispatch-rules';

describe('task-dispatch payload utils', () => {
  it('returns archive filter that excludes archived task statuses', () => {
    expect(getTaskDispatchArchiveFilter()).toEqual({
      AND: [
        {
          OR: [
            { itpProjectId: null },
            { itp_project: { planStatus: { not: 'ARCHIVED' } } },
          ],
        },
        {
          OR: [
            { dfmeaId: null },
            { dfmea_project: { status: { not: 'archived' } } },
          ],
        },
      ],
    });
  });

  it('resolves assignee filter by admin all flag, parent id, and current user', () => {
    expect(
      resolveTaskDispatchAssigneeFilter({
        all: 'true',
        currentUserId: 'u1',
        isAdmin: true,
        parentId: '',
      }),
    ).toEqual({});
    expect(
      resolveTaskDispatchAssigneeFilter({
        all: '1',
        currentUserId: 'u1',
        isAdmin: false,
        parentId: '',
      }),
    ).toEqual({ assigneeId: 'u1' });
    expect(
      resolveTaskDispatchAssigneeFilter({
        all: '',
        currentUserId: 'u1',
        isAdmin: true,
        parentId: 'parent-1',
      }),
    ).toEqual({ parentId: 'parent-1' });
  });

  it('normalizes and resolves status filter values', () => {
    expect(normalizeTaskDispatchStatus('pending')).toBe('PENDING');
    expect(resolveTaskDispatchStatusFilter('processing')).toBe('processing');
    expect(resolveTaskDispatchStatusFilter('pending,processing')).toEqual({
      in: ['pending', 'processing'],
    });
    expect(resolveTaskDispatchStatusFilter('')).toBeUndefined();
  });

  it('resolves user id from token fields and database lookup', async () => {
    expect(resolveTaskDispatchUserId({ id: 12 })).toBe('12');
    expect(resolveTaskDispatchUserId({ userId: '  u1  ' })).toBe('u1');

    const userLookupClient = {
      users: {
        findFirst: vi.fn().mockResolvedValue({ id: 'db-user' }),
      },
    };

    await expect(
      resolveTaskDispatchCurrentUserId(
        { id: 'token-user', username: 'tom' },
        userLookupClient,
      ),
    ).resolves.toBe('db-user');
    expect(userLookupClient.users.findFirst).toHaveBeenCalledWith({
      where: {
        OR: [{ id: 'token-user' }, { username: 'tom' }],
      },
      select: { id: true },
    });

    await expect(
      resolveTaskDispatchCurrentUserId({}, userLookupClient),
    ).resolves.toBeNull();
  });

  it('resolves assignee candidates from one input value', () => {
    expect(resolveTaskDispatchAssigneeCandidates('  user01  ')).toEqual({
      id: 'user01',
      username: 'user01',
    });
    expect(resolveTaskDispatchAssigneeCandidates('')).toBeNull();
    expect(resolveTaskDispatchAssigneeCandidates(undefined)).toBeNull();
  });

  it('resolves itp project id only for ITP_INSPECTION tasks', () => {
    expect(
      resolveTaskDispatchItpProjectIdForValidation({
        itpProjectId: '  plan-1 ',
        type: 'ITP_INSPECTION',
      }),
    ).toBe('plan-1');
    expect(
      resolveTaskDispatchItpProjectIdForValidation({
        itpProjectId: 'plan-1',
        type: 'DFMEA',
      }),
    ).toBeNull();
  });

  it('resolves parent id only for level 2 promotion', () => {
    expect(
      resolveTaskDispatchParentIdForPromotion({ level: 2, parentId: ' p1 ' }),
    ).toBe('p1');
    expect(
      resolveTaskDispatchParentIdForPromotion({ level: 1, parentId: 'p1' }),
    ).toBeNull();
  });

  it('resolves task level with sane fallback', () => {
    expect(resolveTaskDispatchLevel('2')).toBe(2);
    expect(resolveTaskDispatchLevel('0')).toBe(1);
    expect(resolveTaskDispatchLevel('bad')).toBe(1);
  });

  it('detects level two dispatch accurately', () => {
    expect(isTaskDispatchLevelTwo({ level: 2 })).toBe(true);
    expect(isTaskDispatchLevelTwo({ level: '2' })).toBe(true);
    expect(isTaskDispatchLevelTwo({ level: 1 })).toBe(false);
  });

  it('builds normalized create payload with defaults', () => {
    const data = buildTaskDispatchCreateData(
      {
        content: ' hello ',
        deadline: '2026-02-01',
        dfmeaId: ' d1 ',
        itpProjectId: ' p1 ',
        level: '0',
        parentId: ' parent-1 ',
        priority: 'x',
        title: '  New task ',
        type: ' ITP_INSPECTION ',
      },
      {
        assigneeId: 'u-2',
        assignorId: 'u-1',
      },
    );

    expect(data.assignorId).toBe('u-1');
    expect(data.assigneeId).toBe('u-2');
    expect(data.level).toBe(1);
    expect(data.priority).toBe(2);
    expect(data.title).toBe('New task');
    expect(data.type).toBe('ITP_INSPECTION');
    expect(data.itpProjectId).toBe('p1');
    expect(data.parentId).toBe('parent-1');
    expect(data.dueDate).toBeInstanceOf(Date);
  });
});
