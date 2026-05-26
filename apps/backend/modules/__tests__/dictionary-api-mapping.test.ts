import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockDefineEventHandler,
  mockReadBody,
  mockGetQuery,
  mockGetRequestURL,
  mockSetResponseStatus,
  mockDictionaryCreate,
  mockDictionaryUpdate,
  mockDictionaryGetOptions,
  mockDictionaryGetSupportedTypes,
  mockDictionaryList,
  mockRequireSystemAdmin,
  mockGetRequiredRouterParam,
  mockUseResponseSuccess,
  mockBadRequestResponse,
  mockConflictResponse,
  mockInternalServerErrorResponse,
  mockNotFoundResponse,
  mockUsePageResponseSuccess,
  mockUseResponseError,
  mockUnAuthorizedResponse,
  mockIsPrismaUniqueConflictError,
  mockVerifyAccessToken,
} = vi.hoisted(() => ({
  mockDefineEventHandler: vi.fn((handler) => handler),
  mockReadBody: vi.fn(),
  mockGetQuery: vi.fn(),
  mockGetRequestURL: vi.fn(),
  mockSetResponseStatus: vi.fn(),
  mockDictionaryCreate: vi.fn(),
  mockDictionaryUpdate: vi.fn(),
  mockDictionaryGetOptions: vi.fn(),
  mockDictionaryGetSupportedTypes: vi.fn(),
  mockDictionaryList: vi.fn(),
  mockRequireSystemAdmin: vi.fn(),
  mockGetRequiredRouterParam: vi.fn(),
  mockUseResponseSuccess: vi.fn((data) => ({ data, ok: true })),
  mockBadRequestResponse: vi.fn((_, msg) => ({ msg, type: 'bad' })),
  mockConflictResponse: vi.fn((_, msg) => ({ msg, type: 'conflict' })),
  mockInternalServerErrorResponse: vi.fn((_, msg) => ({ msg, type: 'ise' })),
  mockNotFoundResponse: vi.fn((_, msg) => ({ msg, type: 'not_found' })),
  mockUsePageResponseSuccess: vi.fn((page, pageSize, items, extra) => ({
    extra,
    items,
    page,
    pageSize,
    type: 'page_ok',
  })),
  mockUseResponseError: vi.fn((msg) => ({ msg, type: 'error' })),
  mockUnAuthorizedResponse: vi.fn(() => ({ type: 'unauthorized' })),
  mockIsPrismaUniqueConflictError: vi.fn(() => false),
  mockVerifyAccessToken: vi.fn(),
}));

vi.mock('h3', () => ({
  defineEventHandler: mockDefineEventHandler,
  getQuery: mockGetQuery,
  getRequestURL: mockGetRequestURL,
  readBody: mockReadBody,
  setResponseStatus: mockSetResponseStatus,
}));

vi.mock('~/modules/dictionary/dictionary.service', () => ({
  DictionaryService: {
    create: mockDictionaryCreate,
    getSupportedTypes: mockDictionaryGetSupportedTypes,
    getOptions: mockDictionaryGetOptions,
    list: mockDictionaryList,
    update: mockDictionaryUpdate,
  },
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
  unAuthorizedResponse: mockUnAuthorizedResponse,
  usePageResponseSuccess: mockUsePageResponseSuccess,
  useResponseError: mockUseResponseError,
  useResponseSuccess: mockUseResponseSuccess,
}));

vi.mock('~/utils/jwt-utils', () => ({
  verifyAccessToken: mockVerifyAccessToken,
}));

vi.mock('~/utils/prisma-error', () => ({
  isPrismaUniqueConflictError: mockIsPrismaUniqueConflictError,
}));

vi.mock('~/utils/api-logger', () => ({
  logApiError: vi.fn(),
}));

function createEvent() {
  return {
    context: {
      user: { id: 'u1', username: 'admin' },
    },
  };
}

describe('dictionary api mapping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireSystemAdmin.mockReturnValue(null);
    mockGetRequiredRouterParam.mockReturnValue('dict-id');
    mockGetRequestURL.mockReturnValue(
      new URL('http://localhost/api/system/dictionary/types'),
    );
  });

  it('maps duplicate create error to conflict response', async () => {
    const mod = await import('~/api/system/dictionary/index.post');
    mockReadBody.mockResolvedValue({});
    mockDictionaryCreate.mockRejectedValue(new Error('DUPLICATE_DICT_KEY'));

    const res = await mod.default(createEvent() as any);

    expect(mockSetResponseStatus).toHaveBeenCalledWith(expect.anything(), 409);
    expect(mockUseResponseError).toHaveBeenCalledWith('DUPLICATE_DICT_KEY', {
      code: 'DUPLICATE_DICT_KEY',
    });
    expect(res).toEqual({ msg: 'DUPLICATE_DICT_KEY', type: 'error' });
  });

  it('maps validation update error to bad request response', async () => {
    const mod = await import('~/api/system/dictionary/[id].put');
    mockReadBody.mockResolvedValue({});
    mockDictionaryUpdate.mockRejectedValue(
      new Error('VALIDATION:字典键不能为空'),
    );

    const res = await mod.default(createEvent() as any);

    expect(mockSetResponseStatus).toHaveBeenCalledWith(expect.anything(), 400);
    expect(mockUseResponseError).toHaveBeenCalledWith('字典键不能为空', {
      code: 'VALIDATION',
    });
    expect(res).toEqual({ msg: '字典键不能为空', type: 'error' });
  });

  it('maps options validation error to bad request response', async () => {
    const mod = await import('~/api/system/dictionary/options.get');
    mockGetQuery.mockReturnValue({ dictType: 'invalid_type' });
    mockDictionaryGetOptions.mockRejectedValue(
      new Error('VALIDATION:不支持的字典类型'),
    );

    const res = await mod.default(createEvent() as any);

    expect(mockSetResponseStatus).toHaveBeenCalledWith(expect.anything(), 400);
    expect(mockUseResponseError).toHaveBeenCalledWith('不支持的字典类型', {
      code: 'VALIDATION',
    });
    expect(res).toEqual({ msg: '不支持的字典类型', type: 'error' });
  });

  it('maps list success response with paging data', async () => {
    const mod = await import('~/api/system/dictionary/list.get');
    mockGetQuery.mockReturnValue({ page: '2', pageSize: '10' });
    mockDictionaryList.mockResolvedValue({
      items: [{ id: '1' }],
      total: 11,
    });

    const res = await mod.default(createEvent() as any);

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

    const res = await mod.default(createEvent() as any);

    expect(mockUseResponseSuccess).toHaveBeenCalledWith([
      'supplier_status',
      'inspection_process_name',
    ]);
    expect(res).toEqual({
      data: ['supplier_status', 'inspection_process_name'],
      ok: true,
    });
  });

  it('rejects protected routes when auth middleware cannot verify a user', async () => {
    const mod = await import('~/middleware/3.auth');
    mockVerifyAccessToken.mockReturnValue(null);

    const res = mod.default({ context: {}, method: 'GET' } as any);

    expect(mockVerifyAccessToken).toHaveBeenCalledWith(expect.anything());
    expect(mockUnAuthorizedResponse).toHaveBeenCalledWith(expect.anything());
    expect(res).toEqual({ type: 'unauthorized' });
  });

  it('maps dictionary types internal error response when service throws', async () => {
    const mod = await import('~/api/system/dictionary/types.get');
    mockDictionaryGetSupportedTypes.mockImplementationOnce(() => {
      throw new Error('boom');
    });

    const res = await mod.default(createEvent() as any);

    expect(mockInternalServerErrorResponse).toHaveBeenCalledWith(
      expect.anything(),
      '获取字典类型失败',
    );
    expect(res).toEqual({ msg: '获取字典类型失败', type: 'ise' });
  });
});
