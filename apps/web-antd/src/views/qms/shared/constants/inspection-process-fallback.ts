import { $t } from '@vben/locales';

import { INSPECTION_PROCESS_FALLBACK_ITEMS } from '@qgs/shared';

export const INSPECTION_PROCESS_FALLBACK_OPTIONS: Array<{
  label: string;
  value: string;
}> = INSPECTION_PROCESS_FALLBACK_ITEMS.map((item) => ({
  label: $t(`qms.inspection.records.options.process.${item.labelKey}`),
  value: item.value,
}));

export function cloneInspectionProcessFallbackOptions() {
  return INSPECTION_PROCESS_FALLBACK_OPTIONS.map((item) => ({ ...item }));
}
