import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DictionaryService } from '~/modules/dictionary/dictionary.service';

import prisma from '../../utils/prisma';
import { redis } from '../../utils/redis';

vi.mock('../../utils/prisma', () => ({
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

vi.mock('../../utils/redis', () => ({
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
    ).rejects.toThrow('VALIDATION:不支持的字典类型');

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
    ).rejects.toThrow('DUPLICATE_DICT_KEY');

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
    ).rejects.toThrow('DUPLICATE_DICT_KEY');

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
