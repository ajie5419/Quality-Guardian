import { beforeEach, describe, expect, it, vi } from 'vitest';

const buildGovernedWriteFieldsForTable = vi.hoisted(() => vi.fn());

vi.mock('~/utils/governed-write', () => ({
  buildGovernedWriteFieldsForTable,
}));

describe('knowledge category payload utils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('builds create and update data with governed name fields', async () => {
    buildGovernedWriteFieldsForTable.mockReturnValue({
      governedName: 'Category A',
    });
    const {
      buildKnowledgeCategoryCreateData,
      buildKnowledgeCategoryUpdateData,
    } = await import('./knowledge-category');

    expect(
      buildKnowledgeCategoryCreateData({
        description: 'desc',
        name: 'Category A',
        parentId: '',
      }),
    ).toEqual({
      description: 'desc',
      governedName: 'Category A',
      name: 'Category A',
      parentId: null,
    });
    expect(
      buildKnowledgeCategoryUpdateData({
        description: null,
        name: 'Category B',
        parentId: 'CAT-1',
      }),
    ).toEqual({
      description: null,
      governedName: 'Category A',
      name: 'Category B',
      parentId: 'CAT-1',
    });
    expect(buildGovernedWriteFieldsForTable).toHaveBeenCalledWith(
      'knowledge_categories',
      expect.objectContaining({ name: 'Category A' }),
    );
  });

  it('keeps payload stable when governed mapping throws', async () => {
    vi.resetModules();
    buildGovernedWriteFieldsForTable.mockImplementation(() => {
      throw new Error('mapping failed');
    });
    const { buildKnowledgeCategoryCreateData } = await import(
      './knowledge-category'
    );

    expect(buildKnowledgeCategoryCreateData({ name: 'Category A' })).toEqual({
      description: undefined,
      name: 'Category A',
      parentId: null,
    });
  });
});
