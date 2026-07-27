import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DictionaryService } from '~/modules/dictionary/dictionary.service';
import { BusinessError } from '~/utils/business-error';
import prisma from '~/utils/prisma';
import { redis } from '~/utils/redis';

vi.mock('~/utils/prisma', () => ({
  default: {
    dictionaries: {
      count: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('~/utils/redis', () => ({
  redis: {
    del: vi.fn(),
    delByPattern: vi.fn(),
    get: vi.fn(),
    set: vi.fn(),
  },
}));

describe('dictionaryService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns supported dictionary types from shared constants', () => {
    const types = DictionaryService.getSupportedTypes();

    expect(types).toContain('inspection_issue_status');
    expect(types).toContain('supplier_status');
  });

  it('rejects blank required fields before creating entries', async () => {
    await expect(
      DictionaryService.create(
        {
          dictKey: 'OPEN',
          dictType: ' ',
          dictValue: 'Open',
        },
        'tester',
      ),
    ).rejects.toMatchObject({
      code: 'VALIDATION',
      message: '字典类型不能为空',
    });

    await expect(
      DictionaryService.create(
        {
          dictKey: ' ',
          dictType: 'inspection_issue_status',
          dictValue: 'Open',
        },
        'tester',
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION', message: '字典键不能为空' });

    await expect(
      DictionaryService.create(
        {
          dictKey: 'OPEN',
          dictType: 'inspection_issue_status',
          dictValue: ' ',
        },
        'tester',
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION', message: '字典值不能为空' });

    expect(prisma.dictionaries.findFirst).not.toHaveBeenCalled();
  });

  it('rejects unsupported dictType when creating entries', async () => {
    await expect(
      DictionaryService.create(
        {
          dictKey: 'OPEN',
          dictType: 'unsupported_type',
          dictValue: 'Open',
        },
        'tester',
      ),
    ).rejects.toMatchObject({
      code: 'VALIDATION',
      message: '不支持的字典类型',
    } satisfies Partial<BusinessError>);

    expect(prisma.dictionaries.findFirst).not.toHaveBeenCalled();
    expect(prisma.dictionaries.create).not.toHaveBeenCalled();
  });

  it('rejects creating TEAM identities through the generic dictionary service', async () => {
    await expect(
      DictionaryService.create(
        {
          dictKey: 'Team A',
          dictType: 'team',
          dictValue: 'Team A',
        },
        'tester',
      ),
    ).rejects.toMatchObject({
      code: 'TEAM_REQUIRES_DEDICATED_API',
      httpStatus: 409,
    });
    expect(prisma.dictionaries.findFirst).not.toHaveBeenCalled();
    expect(prisma.dictionaries.create).not.toHaveBeenCalled();
  });

  it('rejects duplicate dict key in same dictType when creating', async () => {
    (prisma.dictionaries.findFirst as any).mockResolvedValueOnce({
      id: 'existing-id',
    });

    await expect(
      DictionaryService.create(
        {
          dictKey: 'OPEN',
          dictType: 'inspection_issue_status',
          dictValue: '待处理',
        },
        'tester',
      ),
    ).rejects.toMatchObject({
      code: 'DUPLICATE_DICT_KEY',
      httpStatus: 409,
      message: '字典键已存在',
    } satisfies Partial<BusinessError>);

    expect(prisma.dictionaries.create).not.toHaveBeenCalled();
    expect(redis.del).not.toHaveBeenCalled();
  });

  it('rejects duplicate dict key in update when key changed', async () => {
    (prisma.dictionaries.findFirst as any)
      .mockResolvedValueOnce({
        dictKey: 'OLD',
        dictType: 'supplier_status',
        id: 'dict-1',
        isDeleted: false,
        isSystem: false,
        sort: 0,
        status: 1,
      })
      .mockResolvedValueOnce({ id: 'dict-2' });

    await expect(
      DictionaryService.update(
        'dict-1',
        {
          dictKey: 'QUALIFIED',
        },
        'tester',
      ),
    ).rejects.toMatchObject({
      code: 'DUPLICATE_DICT_KEY',
      httpStatus: 409,
      message: '字典键已存在',
    } satisfies Partial<BusinessError>);

    expect(prisma.dictionaries.update).not.toHaveBeenCalled();
  });

  it('returns cached options first and skips db query', async () => {
    const cached = [{ dictKey: 'OPEN', dictValue: '待处理', id: '1', sort: 0 }];
    (redis.get as any).mockResolvedValueOnce(cached);

    const result = await DictionaryService.getOptions(
      'inspection_issue_status',
    );

    expect(result).toEqual(cached);
    expect(prisma.dictionaries.findMany).not.toHaveBeenCalled();
    expect(redis.set).not.toHaveBeenCalled();
  });

  it('queries db and caches options when cache missing', async () => {
    (redis.get as any).mockResolvedValueOnce(null);
    const dbItems = [
      { dictKey: 'OPEN', dictValue: '待处理', id: '1', sort: 1 },
      { dictKey: 'CLOSED', dictValue: '已关闭', id: '2', sort: 2 },
    ];
    (prisma.dictionaries.findMany as any).mockResolvedValueOnce(dbItems);

    const result = await DictionaryService.getOptions(
      'inspection_issue_status',
    );

    expect(result).toEqual(dbItems);
    expect(prisma.dictionaries.findMany).toHaveBeenCalledWith({
      where: {
        dictType: 'inspection_issue_status',
        isDeleted: false,
        status: 1,
      },
      orderBy: [{ sort: 'asc' }, { createdAt: 'asc' }],
      select: {
        dictKey: true,
        dictValue: true,
        id: true,
        sort: true,
      },
    });
    expect(redis.set).toHaveBeenCalledWith(
      'qms:dict:options:inspection_issue_status',
      dbItems,
      86_400,
    );
  });

  it('always reads TEAM options from the canonical store', async () => {
    const teams = [
      { dictKey: 'Team A', dictValue: 'Team A', id: 'team-1', sort: 1 },
    ];
    (redis.get as any).mockResolvedValueOnce([
      { dictKey: 'Stale team', id: 'team-old' },
    ]);
    (prisma.dictionaries.findMany as any).mockResolvedValueOnce(teams);

    await expect(DictionaryService.getOptions('team')).resolves.toEqual(teams);

    expect(redis.get).not.toHaveBeenCalled();
    expect(redis.set).not.toHaveBeenCalled();
  });

  it('rejects blank and unsupported option dictType', async () => {
    await expect(DictionaryService.getOptions(' ')).rejects.toMatchObject({
      code: 'VALIDATION',
      message: '字典类型不能为空',
    });

    await expect(DictionaryService.getOptions('legacy')).rejects.toMatchObject({
      code: 'VALIDATION',
      message: '不支持的字典类型',
    });

    expect(redis.get).not.toHaveBeenCalled();
  });

  it('lists dictionary entries with paging, filters, and keyword search', async () => {
    (prisma.dictionaries.findMany as any).mockResolvedValueOnce([
      { dictKey: 'OPEN', id: 'dict-1' },
    ]);
    (prisma.dictionaries.count as any).mockResolvedValueOnce(1);

    const result = await DictionaryService.list({
      dictType: 'inspection_issue_status',
      keyword: 'open',
      page: 2,
      pageSize: 5,
      status: 1,
    });

    expect(result).toEqual({
      items: [{ dictKey: 'OPEN', id: 'dict-1' }],
      total: 1,
    });
    expect(prisma.dictionaries.findMany).toHaveBeenCalledWith({
      where: {
        isDeleted: false,
        dictType: 'inspection_issue_status',
        OR: [
          { dictKey: { contains: 'open' } },
          { dictValue: { contains: 'open' } },
        ],
        status: 1,
      },
      orderBy: [{ dictType: 'asc' }, { sort: 'asc' }, { createdAt: 'desc' }],
      skip: 5,
      take: 5,
    });
    expect(prisma.dictionaries.count).toHaveBeenCalledWith({
      where: {
        isDeleted: false,
        dictType: 'inspection_issue_status',
        OR: [
          { dictKey: { contains: 'open' } },
          { dictValue: { contains: 'open' } },
        ],
        status: 1,
      },
    });
  });

  it('rejects unsupported dictType when listing entries', async () => {
    await expect(
      DictionaryService.list({ dictType: 'unsupported_type' }),
    ).rejects.toMatchObject({
      code: 'VALIDATION',
      message: '不支持的字典类型',
    });

    expect(prisma.dictionaries.findMany).not.toHaveBeenCalled();
  });

  it('invalidates scoped cache after successful create', async () => {
    (prisma.dictionaries.findFirst as any).mockResolvedValueOnce(null);
    (prisma.dictionaries.create as any).mockResolvedValueOnce({ id: 'new-id' });

    await DictionaryService.create(
      {
        dictKey: 'OPEN',
        dictType: 'inspection_issue_status',
        dictValue: '待处理',
      },
      'tester',
    );

    expect(redis.del).toHaveBeenCalledWith(
      'qms:dict:options:inspection_issue_status',
    );
  });

  it('invalidates scoped cache after successful update', async () => {
    (prisma.dictionaries.findFirst as any).mockResolvedValueOnce({
      dictKey: 'OPEN',
      dictType: 'inspection_issue_status',
      id: 'dict-1',
      isDeleted: false,
      isSystem: false,
      sort: 0,
      status: 1,
    });
    (prisma.dictionaries.update as any).mockResolvedValueOnce({
      id: 'dict-1',
    });

    await DictionaryService.update(
      'dict-1',
      { dictValue: 'Open', sort: 1 },
      'tester',
    );

    expect(redis.del).toHaveBeenCalledWith(
      'qms:dict:options:inspection_issue_status',
    );
  });

  it('invalidates scoped cache after successful delete', async () => {
    (prisma.dictionaries.findFirst as any).mockResolvedValueOnce({
      dictType: 'supplier_status',
      id: 'dict-1',
      isSystem: false,
    });
    (prisma.dictionaries.update as any).mockResolvedValueOnce({
      id: 'dict-1',
    });

    await DictionaryService.delete('dict-1', 'tester');

    expect(redis.del).toHaveBeenCalledWith('qms:dict:options:supplier_status');
  });

  it('rejects deleting TEAM identities through the generic dictionary service', async () => {
    (prisma.dictionaries.findFirst as any).mockResolvedValueOnce({
      dictType: 'team',
      id: 'team-1',
      isSystem: false,
    });

    await expect(
      DictionaryService.delete('team-1', 'tester'),
    ).rejects.toMatchObject({
      code: 'TEAM_REQUIRES_DEDICATED_API',
      httpStatus: 409,
    });
    expect(prisma.dictionaries.update).not.toHaveBeenCalled();
  });

  it('rejects updating TEAM identities through the generic dictionary service', async () => {
    (prisma.dictionaries.findFirst as any).mockResolvedValueOnce({
      dictKey: 'Team A',
      dictType: 'team',
      id: 'team-1',
      isSystem: false,
      sort: 0,
      status: 1,
    });

    await expect(
      DictionaryService.update('team-1', { status: 0 }, 'tester'),
    ).rejects.toMatchObject({
      code: 'TEAM_REQUIRES_DEDICATED_API',
      httpStatus: 409,
    });
    expect(prisma.dictionaries.update).not.toHaveBeenCalled();
  });

  it('rejects delete when dictionary item is missing or system-owned', async () => {
    (prisma.dictionaries.findFirst as any).mockResolvedValueOnce(null);

    await expect(
      DictionaryService.delete('missing', 'tester'),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
      httpStatus: 404,
      message: '字典项不存在',
    });

    (prisma.dictionaries.findFirst as any).mockResolvedValueOnce({
      dictType: 'supplier_status',
      id: 'system-id',
      isSystem: true,
    });

    await expect(
      DictionaryService.delete('system-id', 'tester'),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN_SYSTEM_DICT',
      message: '系统内置字典项不允许删除',
    });

    expect(prisma.dictionaries.update).not.toHaveBeenCalled();
  });

  it('rejects missing item, blank fields, and disabling system item when updating', async () => {
    (prisma.dictionaries.findFirst as any).mockResolvedValueOnce(null);

    await expect(
      DictionaryService.update('missing', { dictValue: 'Open' }, 'tester'),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
      httpStatus: 404,
      message: '字典项不存在',
    });

    (prisma.dictionaries.findFirst as any).mockResolvedValueOnce({
      dictKey: 'OPEN',
      dictType: 'inspection_issue_status',
      id: 'dict-1',
      isSystem: false,
      sort: 0,
      status: 1,
    });

    await expect(
      DictionaryService.update('dict-1', { dictKey: ' ' }, 'tester'),
    ).rejects.toMatchObject({
      code: 'VALIDATION',
      message: '字典键不能为空',
    });

    (prisma.dictionaries.findFirst as any).mockResolvedValueOnce({
      dictKey: 'OPEN',
      dictType: 'inspection_issue_status',
      id: 'dict-1',
      isSystem: false,
      sort: 0,
      status: 1,
    });

    await expect(
      DictionaryService.update('dict-1', { dictValue: ' ' }, 'tester'),
    ).rejects.toMatchObject({
      code: 'VALIDATION',
      message: '字典值不能为空',
    });

    (prisma.dictionaries.findFirst as any).mockResolvedValueOnce({
      dictKey: 'OPEN',
      dictType: 'inspection_issue_status',
      id: 'dict-1',
      isSystem: true,
      sort: 0,
      status: 1,
    });

    await expect(
      DictionaryService.update('dict-1', { status: 0 }, 'tester'),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN_SYSTEM_DICT',
      message: '系统内置字典项不允许禁用',
    });
  });

  it('normalizes mutable fields and keeps existing fallback values when updating', async () => {
    (prisma.dictionaries.findFirst as any).mockResolvedValueOnce({
      dictKey: 'OPEN',
      dictType: 'inspection_issue_status',
      id: 'dict-1',
      isSystem: false,
      sort: 9,
      status: 1,
    });
    (prisma.dictionaries.update as any).mockResolvedValueOnce({
      id: 'dict-1',
      sort: 9,
      status: 1,
    });

    await DictionaryService.update(
      'dict-1',
      {
        dictKey: ' OPEN ',
        dictValue: ' Open ',
        remark: ' ',
        sort: 'bad' as any,
        status: '' as any,
      },
      'tester',
    );

    expect(prisma.dictionaries.update).toHaveBeenCalledWith({
      where: { id: 'dict-1' },
      data: {
        dictKey: 'OPEN',
        dictValue: 'Open',
        remark: null,
        sort: 9,
        status: 1,
        updatedBy: 'tester',
      },
    });
    expect(redis.del).toHaveBeenCalledWith(
      'qms:dict:options:inspection_issue_status',
    );
  });

  it('accepts newly supported supervision/planning dict types', async () => {
    (prisma.dictionaries.findFirst as any).mockResolvedValueOnce(null);
    (prisma.dictionaries.create as any).mockResolvedValueOnce({ id: 'new-id' });

    await expect(
      DictionaryService.create(
        {
          dictKey: 'PLANNED',
          dictType: 'supervision_project_status',
          dictValue: '计划中',
        },
        'tester',
      ),
    ).resolves.toEqual({ id: 'new-id' });

    expect(prisma.dictionaries.create).toHaveBeenCalled();
    expect(redis.del).toHaveBeenCalledWith(
      'qms:dict:options:supervision_project_status',
    );
  });
});
