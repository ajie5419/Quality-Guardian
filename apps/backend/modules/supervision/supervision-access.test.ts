import { describe, expect, it, vi } from 'vitest';
import { BusinessError } from '~/utils/business-error';

import {
  buildSupervisionAccessContext,
  buildSupervisionAccessWhere,
} from './supervision-access';
import {
  assertSupervisionIssueTransition,
  assertSupervisionProjectTransition,
  SUPERVISION_ISSUE_TRANSITIONS,
  SUPERVISION_PROJECT_TRANSITIONS,
} from './supervision-state';

vi.mock('~/utils/governed-write', () => ({
  buildGovernedCanonicalWritePairForTable: vi.fn().mockResolvedValue({}),
  buildGovernedWriteFieldsForTable: vi.fn().mockReturnValue({}),
}));

vi.mock('~/modules/system-log', () => ({
  SystemLogService: {
    auditLog: vi.fn().mockResolvedValue(undefined),
  },
}));

const prisma = {
  supervision_issues: {
    findFirst: vi.fn(),
    updateMany: vi.fn(),
  },
};

vi.mock('~/modules/supervision/supervision-shared', async (orig) => {
  const actual = (await orig()) as any;
  return { ...actual, prisma };
});

function userinfo(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    realName: 'User One',
    roles: ['normal'],
    username: 'user1',
    ...overrides,
  };
}

describe('supervision access context', () => {
  it('builds a context from the authenticated user', () => {
    const context = buildSupervisionAccessContext(userinfo() as never);
    expect(context.isAdmin).toBe(false);
    expect(context.userId).toBe('1');
    expect(context.user.username).toBe('user1');
  });

  it('marks super/admin roles as admins with full row access', () => {
    const admin = buildSupervisionAccessContext(
      userinfo({ roles: ['super'] }) as never,
    );
    expect(admin.isAdmin).toBe(true);
    expect(buildSupervisionAccessWhere('project', admin)).toEqual({});
    expect(buildSupervisionAccessWhere('issue', admin)).toEqual({});
    expect(buildSupervisionAccessWhere('report', admin)).toEqual({});
    expect(buildSupervisionAccessWhere('task', admin)).toEqual({});
  });

  it('scopes non-admin writes to the creator for project/issue/report', () => {
    const context = buildSupervisionAccessContext(userinfo() as never);
    expect(buildSupervisionAccessWhere('project', context)).toEqual({
      createdBy: '1',
    });
    expect(buildSupervisionAccessWhere('issue', context)).toEqual({
      createdBy: '1',
    });
    expect(buildSupervisionAccessWhere('report', context)).toEqual({
      createdBy: '1',
    });
  });

  it('lets tasks inherit the parent project creator scope', () => {
    const context = buildSupervisionAccessContext(userinfo() as never);
    expect(buildSupervisionAccessWhere('task', context)).toEqual({
      project: { createdBy: '1' },
    });
  });

  it('fails closed when the user id cannot be resolved', () => {
    const context = buildSupervisionAccessContext(
      userinfo({ id: undefined }) as never,
    );
    // No user id means no row can match the creator predicate; admin is
    // false because the roles are still non-admin, so nothing degenerates to
    // full access.
    expect(context.userId).toBe('');
    expect(buildSupervisionAccessWhere('project', context)).toEqual({
      createdBy: '',
    });
  });
});

describe('supervision state machine', () => {
  it('defines explicit project transitions', () => {
    expect(SUPERVISION_PROJECT_TRANSITIONS.PLANNED).toEqual([
      'IN_PROGRESS',
      'COMPLETED',
      'PAUSED',
    ]);
    expect(SUPERVISION_PROJECT_TRANSITIONS.COMPLETED).toEqual(['IN_PROGRESS']);
  });

  it('defines explicit issue transitions', () => {
    expect(SUPERVISION_ISSUE_TRANSITIONS.OPEN).toEqual([
      'IN_PROGRESS',
      'VERIFYING',
      'CLOSED',
    ]);
    expect(SUPERVISION_ISSUE_TRANSITIONS.CLOSED).toEqual(['OPEN']);
  });

  it('allows legal transitions and rejects illegal jumps with 409', () => {
    expect(() =>
      assertSupervisionProjectTransition('PLANNED', 'IN_PROGRESS'),
    ).not.toThrow();
    expect(() =>
      assertSupervisionProjectTransition('COMPLETED', 'IN_PROGRESS'),
    ).not.toThrow();
    try {
      assertSupervisionProjectTransition('COMPLETED', 'PAUSED');
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(BusinessError);
      expect((error as BusinessError).httpStatus).toBe(409);
    }
    expect(() =>
      assertSupervisionIssueTransition('CLOSED', 'VERIFYING'),
    ).toThrow(BusinessError);
    expect(() =>
      assertSupervisionIssueTransition('OPEN', 'CLOSED'),
    ).not.toThrow();
  });
});

describe('supervision CAS object authorization (SEC-SUPERVISION-001)', () => {
  const userA = buildSupervisionAccessContext(userinfo() as never);
  const userB = buildSupervisionAccessContext(
    userinfo({ id: 2, username: 'user2', realName: 'User Two' }) as never,
  );

  it('lets user A delete own issue and blocks user B with 404', async () => {
    const { SupervisionIssueService: Service } = await import(
      './supervision-issue.service'
    );
    vi.clearAllMocks();
    vi.mocked(prisma.supervision_issues.findFirst).mockResolvedValue({
      status: 'OPEN',
    } as never);
    vi.mocked(prisma.supervision_issues.updateMany).mockResolvedValue({
      count: 1,
    } as never);

    await expect(
      Service.deleteIssue('issue-1', userA),
    ).resolves.toBeUndefined();
    expect(prisma.supervision_issues.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'issue-1',
          isDeleted: false,
          status: { not: 'CLOSED' },
          createdBy: '1',
        },
      }),
    );

    vi.mocked(prisma.supervision_issues.findFirst).mockResolvedValue(
      null as never,
    );
    await expect(Service.deleteIssue('issue-2', userB)).rejects.toMatchObject({
      httpStatus: 404,
    });
  });

  it('returns 409 when the CAS claim fails (concurrent status change)', async () => {
    const { SupervisionIssueService: Service } = await import(
      './supervision-issue.service'
    );
    vi.clearAllMocks();
    vi.mocked(prisma.supervision_issues.findFirst).mockResolvedValue({
      status: 'OPEN',
    } as never);
    vi.mocked(prisma.supervision_issues.updateMany).mockResolvedValue({
      count: 0,
    } as never);

    await expect(
      Service.updateIssue('issue-1', { status: 'CLOSED' }, userA),
    ).rejects.toMatchObject({ httpStatus: 409 });
  });
});
