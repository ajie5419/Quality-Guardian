import { readBody } from 'h3';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RbacService } from '~/modules/rbac/rbac.service';
import handler from '~/modules/rbac/role-data-scope.post.service';
import { requireSystemAdmin } from '~/modules/user/system-auth';
import { getCurrentUser } from '~/utils/current-user';
import {
  badRequestResponse,
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';
import { getRequiredRouterParam } from '~/utils/route-param';

vi.mock('h3', () => ({
  defineEventHandler: (fn: any) => fn,
  readBody: vi.fn(),
}));

vi.mock('~/modules/rbac/rbac.service', () => ({
  RbacService: {
    saveRoleDataScope: vi.fn(),
  },
}));

vi.mock('~/modules/user/system-auth', () => ({
  requireSystemAdmin: vi.fn(),
}));

vi.mock('~/utils/api-logger', () => ({
  logApiError: vi.fn(),
}));

vi.mock('~/utils/current-user', () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock('~/utils/response', () => ({
  badRequestResponse: vi.fn(),
  internalServerErrorResponse: vi.fn(),
  useResponseSuccess: vi.fn(),
}));

vi.mock('~/utils/route-param', () => ({
  getRequiredRouterParam: vi.fn(),
}));

function mockEvent() {
  return { context: { user: { id: 'user-1', username: 'admin' } } } as any;
}

describe('roleDataScopePostService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getCurrentUser as any).mockReturnValue({
      id: 'user-1',
      username: 'admin',
    });
    (requireSystemAdmin as any).mockReturnValue(null);
  });

  it('should save data scope successfully', async () => {
    (getRequiredRouterParam as any).mockReturnValue('r1');
    (readBody as any).mockResolvedValue({
      module: 'inspection',
      scopeType: 'DEPT',
      deptIds: ['d1', 'd2'],
    });
    (useResponseSuccess as any).mockReturnValue({ code: 0 });

    const _result = await handler(mockEvent());

    expect(RbacService.saveRoleDataScope).toHaveBeenCalledWith(
      'r1',
      'inspection',
      'DEPT',
      ['d1', 'd2'],
    );
    expect(useResponseSuccess).toHaveBeenCalledWith(null);
  });

  it('should return badRequestResponse when module is empty', async () => {
    (getRequiredRouterParam as any).mockReturnValue('r1');
    (readBody as any).mockResolvedValue({ module: '', scopeType: 'ALL' });
    (badRequestResponse as any).mockReturnValue({ code: 1 });

    const event = mockEvent();
    await handler(event);

    expect(badRequestResponse).toHaveBeenCalledWith(event, 'module 不能为空');
  });

  it('should return badRequestResponse when scopeType is invalid', async () => {
    (getRequiredRouterParam as any).mockReturnValue('r1');
    (readBody as any).mockResolvedValue({
      module: 'inspection',
      scopeType: 'INVALID',
    });
    (badRequestResponse as any).mockReturnValue({ code: 1 });

    const event = mockEvent();
    await handler(event);

    expect(badRequestResponse).toHaveBeenCalledWith(
      event,
      'scopeType 仅支持 ALL/DEPT/SELF',
    );
  });

  it('should default scopeType to SELF', async () => {
    (getRequiredRouterParam as any).mockReturnValue('r1');
    (readBody as any).mockResolvedValue({ module: 'inspection' });
    (useResponseSuccess as any).mockReturnValue({ code: 0 });

    await handler(mockEvent());

    expect(RbacService.saveRoleDataScope).toHaveBeenCalledWith(
      'r1',
      'inspection',
      'SELF',
      [],
    );
  });

  it('should return error when id is not a string', async () => {
    (getRequiredRouterParam as any).mockReturnValue({ message: 'error' });

    const result = await handler(mockEvent());

    expect(result).toEqual({ message: 'error' });
  });

  it('should return internalServerErrorResponse on error', async () => {
    (getRequiredRouterParam as any).mockReturnValue('r1');
    (readBody as any).mockResolvedValue({ module: 'inspection' });
    (RbacService.saveRoleDataScope as any).mockRejectedValue(
      new Error('save failed'),
    );
    (internalServerErrorResponse as any).mockReturnValue({ code: 1 });

    const event = mockEvent();
    const _result = await handler(event);

    expect(internalServerErrorResponse).toHaveBeenCalledWith(
      event,
      '保存数据权限策略失败',
    );
  });

  it('should return admin check result when user is not admin', async () => {
    (requireSystemAdmin as any).mockReturnValue({ code: 403 });

    const result = await handler(mockEvent());

    expect(result).toEqual({ code: 403 });
    expect(RbacService.saveRoleDataScope).not.toHaveBeenCalled();
  });

  it('should normalize scopeType to uppercase', async () => {
    (getRequiredRouterParam as any).mockReturnValue('r1');
    (readBody as any).mockResolvedValue({
      module: 'inspection',
      scopeType: 'dept',
    });
    (useResponseSuccess as any).mockReturnValue({ code: 0 });

    await handler(mockEvent());

    expect(RbacService.saveRoleDataScope).toHaveBeenCalledWith(
      'r1',
      'inspection',
      'DEPT',
      [],
    );
  });
});
