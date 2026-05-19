import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockDefineEventHandler,
  mockReadBody,
  mockGetQuery,
  mockSetResponseStatus,
  mockDictionaryCreate,
  mockDictionaryUpdate,
  mockDictionaryGetOptions,
  mockDictionaryGetSupportedTypes,
  mockDictionaryList,
  mockVerifyAccessToken,
  mockRequireSystemAdmin,
  mockGetRequiredRouterParam,
  mockUseResponseSuccess,
  mockBadRequestResponse,
  mockConflictResponse,
  mockInternalServerErrorResponse,
  mockNotFoundResponse,
  mockUnauthorizedResponse,
  mockUsePageResponseSuccess,
  mockUseResponseError,
  mockIsPrismaUniqueConflictError,
} = vi.hoisted(() => ({
  mockDefineEventHandler: vi.fn((handler) => handler),
  mockReadBody: vi.fn(),
  mockGetQuery: vi.fn(),
  mockSetResponseStatus: vi.fn(),
  mockDictionaryCreate: vi.fn(),
  mockDictionaryUpdate: vi.fn(),
  mockDictionaryGetOptions: vi.fn(),
  mockDictionaryGetSupportedTypes: vi.fn(),
  mockDictionaryList: vi.fn(),
  mockVerifyAccessToken: vi.fn(),
  mockRequireSystemAdmin: vi.fn(),
  mockGetRequiredRouterParam: vi.fn(),
  mockUseResponseSuccess: vi.fn((data) => ({ data, ok: true })),
  mockBadRequestResponse: vi.fn((_, msg) => ({ msg, type: 'bad' })),
  mockConflictResponse: vi.fn((_, msg) => ({ msg, type: 'conflict' })),
  mockInternalServerErrorResponse: vi.fn((_, msg) => ({ msg, type: 'ise' })),
  mockNotFoundResponse: vi.fn((_, msg) => ({ msg, type: 'not_found' })),
  mockUnauthorizedResponse: vi.fn(() => ({ type: 'unauthorized' })),
  mockUsePageResponseSuccess: vi.fn((page, pageSize, items, extra) => ({
    extra,
    items,
    page,
    pageSize,
    type: 'page_ok',
  })),
  mockUseResponseError: vi.fn((msg) => ({ msg, type: 'error' })),
  mockIsPrismaUniqueConflictError: vi.fn(() => false),
}));

vi.mock('h3', () => ({
  defineEventHandler: mockDefineEventHandler,
  getQuery: mockGetQuery,
  readBody: mockReadBody,
  setResponseStatus: mockSetResponseStatus,
}));

vi.mock('~/services/dictionary.service', () => ({
  DictionaryService: {
    create: mockDictionaryCreate,
    getSupportedTypes: mockDictionaryGetSupportedTypes,
    getOptions: mockDictionaryGetOptions,
    list: mockDictionaryList,
    update: mockDictionaryUpdate,
  },
}));

vi.mock('~/utils/jwt-utils', () => ({
  verifyAccessToken: mockVerifyAccessToken,
}));

vi.mock('~/utils/system-auth', () => ({
  requireSystemAdmin: mockRequireSystemAdmin,
}));

vi.mock('~/utils/route-param', () => ({
  getRequiredRouterParam: mockGetRequiredRouterParam,
}));

vi.mock('~/utils/response', () => ({
  badRequestResponse: mockBadRequestResponse,
  conflictResponse: mockConflictResponse,
  internalServerErrorResponse: mockInternalServerErrorResponse,
  notFoundResponse: mockNotFoundResponse,
  unAuthorizedResponse: mockUnauthorizedResponse,
  usePageResponseSuccess: mockUsePageResponseSuccess,
  useResponseError: mockUseResponseError,
  useResponseSuccess: mockUseResponseSuccess,
}));

vi.mock('~/utils/prisma-error', () => ({
  isPrismaUniqueConflictError: mockIsPrismaUniqueConflictError,
}));

vi.mock('~/utils/api-logger', () => ({
  logApiError: vi.fn(),
}));

describe('dictionary api mapping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyAccessToken.mockReturnValue({ id: 'u1', username: 'admin' });
    mockRequireSystemAdmin.mockReturnValue(null);
    mockGetRequiredRouterParam.mockReturnValue('dict-id');
  });

  it('maps duplicate create error to conflict response', async () => {
    const mod = await import('~/api/system/dictionary/index.post');
    mockReadBody.mockResolvedValue({});
    mockDictionaryCreate.mockRejectedValue(new Error('DUPLICATE_DICT_KEY'));

    const res = await mod.default({} as any);

    expect(mockConflictResponse).toHaveBeenCalledWith(
      expect.anything(),
      '字典键已存在',
    );
    expect(res).toEqual({ msg: '字典键已存在', type: 'conflict' });
  });

  it('maps validation update error to bad request response', async () => {
    const mod = await import('~/api/system/dictionary/[id].put');
    mockReadBody.mockResolvedValue({});
    mockDictionaryUpdate.mockRejectedValue(
      new Error('VALIDATION:字典键不能为空'),
    );

    const res = await mod.default({} as any);

    expect(mockBadRequestResponse).toHaveBeenCalledWith(
      expect.anything(),
      '字典键不能为空',
    );
    expect(res).toEqual({ msg: '字典键不能为空', type: 'bad' });
  });

  it('maps options validation error to bad request response', async () => {
    const mod = await import('~/api/system/dictionary/options.get');
    mockGetQuery.mockReturnValue({ dictType: 'invalid_type' });
    mockDictionaryGetOptions.mockRejectedValue(
      new Error('VALIDATION:不支持的字典类型'),
    );

    const res = await mod.default({} as any);

    expect(mockBadRequestResponse).toHaveBeenCalledWith(
      expect.anything(),
      '不支持的字典类型',
    );
    expect(res).toEqual({ msg: '不支持的字典类型', type: 'bad' });
  });

  it('maps list success response with paging data', async () => {
    const mod = await import('~/api/system/dictionary/list.get');
    mockGetQuery.mockReturnValue({ page: '2', pageSize: '10' });
    mockDictionaryList.mockResolvedValue({
      items: [{ id: '1' }],
      total: 11,
    });

    const res = await mod.default({} as any);

    expect(mockUsePageResponseSuccess).toHaveBeenCalledWith(
      2,
      10,
      [{ id: '1' }],
      { total: 11 },
    );
    expect(res).toEqual({
      extra: { total: 11 },
      items: [{ id: '1' }],
      page: 2,
      pageSize: 10,
      type: 'page_ok',
    });
  });

  it('maps dictionary types success response', async () => {
    const mod = await import('~/api/system/dictionary/types.get');
    mockDictionaryGetSupportedTypes.mockReturnValue([
      'supplier_status',
      'inspection_process_name',
    ]);

    const res = await mod.default({} as any);

    expect(mockUseResponseSuccess).toHaveBeenCalledWith([
      'supplier_status',
      'inspection_process_name',
    ]);
    expect(res).toEqual({
      data: ['supplier_status', 'inspection_process_name'],
      ok: true,
    });
  });

  it('maps dictionary types unauthorized response when token missing', async () => {
    const mod = await import('~/api/system/dictionary/types.get');
    mockVerifyAccessToken.mockReturnValueOnce(null);

    const res = await mod.default({} as any);

    expect(mockUnauthorizedResponse).toHaveBeenCalledTimes(1);
    expect(res).toEqual({ type: 'unauthorized' });
  });

  it('maps dictionary types internal error response when service throws', async () => {
    const mod = await import('~/api/system/dictionary/types.get');
    mockDictionaryGetSupportedTypes.mockImplementationOnce(() => {
      throw new Error('boom');
    });

    const res = await mod.default({} as any);

    expect(mockInternalServerErrorResponse).toHaveBeenCalledWith(
      expect.anything(),
      '获取字典类型失败',
    );
    expect(res).toEqual({ msg: '获取字典类型失败', type: 'ise' });
  });
});
