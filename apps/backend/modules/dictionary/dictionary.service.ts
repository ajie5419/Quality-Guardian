import { QMS_DICTIONARY_TYPES } from '@qgs/shared';
import { BusinessError } from '~/utils/business-error';
import prisma from '~/utils/prisma';
import { buildKeywordOr } from '~/utils/query-helpers';
import { redis } from '~/utils/redis';

const DICT_CACHE_KEY_PREFIX = 'qms:dict';
const DICT_OPTIONS_TTL_SECONDS = 3600 * 24;
const SUPPORTED_DICT_TYPES = new Set<string>(
  QMS_DICTIONARY_TYPES as readonly string[],
);

export interface DictionaryCreateDto {
  dictType?: string;
  dictKey?: string;
  dictValue?: string;
  isSystem?: boolean;
  remark?: string;
  sort?: number;
  status?: number;
}

export interface DictionaryListQuery {
  dictType?: string;
  keyword?: string;
  page?: number;
  pageSize?: number;
  status?: number;
}

export interface DictionaryUpdateDto {
  dictKey?: string;
  dictValue?: string;
  remark?: string;
  sort?: number;
  status?: number;
}

function buildDictOptionsCacheKey(dictType: string) {
  return `${DICT_CACHE_KEY_PREFIX}:options:${dictType}`;
}

function normalizeDictText(value: unknown) {
  return String(value || '').trim();
}

function normalizeStatus(value: unknown, defaultValue: number) {
  if (value === undefined || value === null || value === '')
    return defaultValue;
  const num = Number(value);
  return Number.isFinite(num) ? num : defaultValue;
}

function ensureSupportedDictType(dictType: string) {
  if (!SUPPORTED_DICT_TYPES.has(dictType)) {
    throw new BusinessError('VALIDATION', '不支持的字典类型');
  }
}

async function invalidateDictCache(dictType?: string) {
  if (dictType) {
    await redis.del(buildDictOptionsCacheKey(dictType));
    return;
  }
  await redis.delByPattern(`${DICT_CACHE_KEY_PREFIX}:options:*`);
}

export const DictionaryService = {
  getSupportedTypes() {
    return [...QMS_DICTIONARY_TYPES];
  },

  async create(data: DictionaryCreateDto, operator: string) {
    const dictType = normalizeDictText(data.dictType);
    const dictKey = normalizeDictText(data.dictKey);
    const dictValue = normalizeDictText(data.dictValue);

    if (!dictType) {
      throw new BusinessError('VALIDATION', '字典类型不能为空');
    }
    if (!dictKey) {
      throw new BusinessError('VALIDATION', '字典键不能为空');
    }
    if (!dictValue) {
      throw new BusinessError('VALIDATION', '字典值不能为空');
    }
    ensureSupportedDictType(dictType);

    const duplicate = await prisma.dictionaries.findFirst({
      where: {
        dictKey,
        dictType,
        isDeleted: false,
      },
      select: { id: true },
    });
    if (duplicate) {
      throw new BusinessError('DUPLICATE_DICT_KEY', '字典键已存在', 409);
    }

    const created = await prisma.dictionaries.create({
      data: {
        createdBy: operator,
        dictKey,
        dictType,
        dictValue,
        isDeleted: false,
        isSystem: Boolean(data.isSystem),
        remark: normalizeDictText(data.remark) || null,
        sort: normalizeStatus(data.sort, 0),
        status: normalizeStatus(data.status, 1),
        updatedBy: operator,
      },
    });

    await invalidateDictCache(dictType);
    return created;
  },

  async delete(id: string, operator: string) {
    const existing = await prisma.dictionaries.findFirst({
      where: { id, isDeleted: false },
    });
    if (!existing) {
      throw new BusinessError('NOT_FOUND', '字典项不存在', 404);
    }
    if (existing.isSystem) {
      throw new BusinessError(
        'FORBIDDEN_SYSTEM_DICT',
        '系统内置字典项不允许删除',
      );
    }

    await prisma.dictionaries.update({
      where: { id },
      data: {
        isDeleted: true,
        updatedBy: operator,
      },
    });

    await invalidateDictCache(existing.dictType);
  },

  async getOptions(dictType: string) {
    const normalizedType = normalizeDictText(dictType);
    if (!normalizedType) {
      throw new BusinessError('VALIDATION', '字典类型不能为空');
    }
    ensureSupportedDictType(normalizedType);

    const cacheKey = buildDictOptionsCacheKey(normalizedType);
    const cached = await redis.get(cacheKey);
    if (cached) {
      return cached;
    }

    const items = await prisma.dictionaries.findMany({
      where: {
        dictType: normalizedType,
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

    await redis.set(cacheKey, items, DICT_OPTIONS_TTL_SECONDS);
    return items;
  },

  async list(params: DictionaryListQuery) {
    const page = Math.max(1, Number(params.page || 1));
    const pageSize = Math.max(1, Number(params.pageSize || 20));
    const skip = (page - 1) * pageSize;
    const dictType = normalizeDictText(params.dictType);
    const keyword = normalizeDictText(params.keyword);

    const where: any = {
      isDeleted: false,
    };
    if (dictType) {
      ensureSupportedDictType(dictType);
      where.dictType = dictType;
    }
    const keywordOr = buildKeywordOr(keyword, [
      'dictKey',
      'dictValue',
    ] as const);
    if (keywordOr) Object.assign(where, keywordOr);
    if (
      params.status !== undefined &&
      params.status !== null &&
      !Number.isNaN(Number(params.status))
    ) {
      where.status = Number(params.status);
    }

    const [items, total] = await Promise.all([
      prisma.dictionaries.findMany({
        where,
        orderBy: [{ dictType: 'asc' }, { sort: 'asc' }, { createdAt: 'desc' }],
        skip,
        take: pageSize,
      }),
      prisma.dictionaries.count({ where }),
    ]);

    return {
      items,
      total,
    };
  },

  async update(id: string, data: DictionaryUpdateDto, operator: string) {
    const existing = await prisma.dictionaries.findFirst({
      where: { id, isDeleted: false },
    });
    if (!existing) {
      throw new BusinessError('NOT_FOUND', '字典项不存在', 404);
    }
    ensureSupportedDictType(existing.dictType);

    const dictKey =
      data.dictKey === undefined ? undefined : normalizeDictText(data.dictKey);
    const dictValue =
      data.dictValue === undefined
        ? undefined
        : normalizeDictText(data.dictValue);

    if (dictKey !== undefined && !dictKey) {
      throw new BusinessError('VALIDATION', '字典键不能为空');
    }
    if (dictValue !== undefined && !dictValue) {
      throw new BusinessError('VALIDATION', '字典值不能为空');
    }

    if (existing.isSystem && data.status === 0) {
      throw new BusinessError(
        'FORBIDDEN_SYSTEM_DICT',
        '系统内置字典项不允许禁用',
      );
    }

    if (dictKey !== undefined && dictKey !== existing.dictKey) {
      const duplicate = await prisma.dictionaries.findFirst({
        where: {
          dictKey,
          dictType: existing.dictType,
          id: { not: id },
          isDeleted: false,
        },
        select: { id: true },
      });
      if (duplicate) {
        throw new BusinessError('DUPLICATE_DICT_KEY', '字典键已存在', 409);
      }
    }

    const updated = await prisma.dictionaries.update({
      where: { id },
      data: {
        ...(dictKey === undefined ? {} : { dictKey }),
        ...(dictValue === undefined ? {} : { dictValue }),
        ...(data.remark === undefined
          ? {}
          : { remark: normalizeDictText(data.remark) || null }),
        ...(data.sort === undefined
          ? {}
          : { sort: normalizeStatus(data.sort, existing.sort) }),
        ...(data.status === undefined
          ? {}
          : { status: normalizeStatus(data.status, existing.status) }),
        updatedBy: operator,
      },
    });

    await invalidateDictCache(existing.dictType);
    return updated;
  },
};
