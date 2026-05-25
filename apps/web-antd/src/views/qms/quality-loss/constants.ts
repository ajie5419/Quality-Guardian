import type { DictionaryOptionItem } from '#/api/system/dictionary';

import {
  QUALITY_LOSS_SOURCE_STYLE_MAP,
  QUALITY_LOSS_STATUS_COLOR_MAP,
  QUALITY_LOSS_STATUS_FALLBACK_VALUES,
  QUALITY_LOSS_TYPE_OPTIONS,
} from '@qgs/shared';

/**
 * 损失类型选项
 */
export function mapDictionaryOptionsToLossType(
  options?: DictionaryOptionItem[],
) {
  if (!options || options.length === 0) {
    return [...QUALITY_LOSS_TYPE_OPTIONS];
  }
  return options.map((item) => ({
    label: item.dictValue || item.dictKey,
    value: item.dictKey,
  }));
}

function normalizeStatusKey(value: string) {
  return String(value || '')
    .trim()
    .toUpperCase();
}

const QUALITY_LOSS_STATUS_COLOR_LOOKUP: Record<string, string> =
  QUALITY_LOSS_STATUS_COLOR_MAP;

export function mapDictionaryOptionsToQualityLossStatus(
  options?: DictionaryOptionItem[],
) {
  if (!options || options.length === 0) {
    return QUALITY_LOSS_STATUS_FALLBACK_VALUES.map((value) => ({
      value,
      label: value,
      color:
        QUALITY_LOSS_STATUS_COLOR_LOOKUP[normalizeStatusKey(value)] ||
        'default',
    }));
  }

  return options.map((item) => ({
    value: item.dictKey,
    label: item.dictValue || item.dictKey,
    color:
      QUALITY_LOSS_STATUS_COLOR_LOOKUP[normalizeStatusKey(item.dictKey)] ||
      'default',
  }));
}

/**
 * 损失来源样式映射
 */
export const SOURCE_STYLE_MAP = QUALITY_LOSS_SOURCE_STYLE_MAP;
