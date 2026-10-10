import type { QmsMetrologyApi } from '#/api/qms/metrology';

import { getMetrologyListPage } from '#/api/qms/metrology';

/** Use catalog read permission, not export permission, without truncating options. */
export async function loadCalibrationInstrumentOptions() {
  const items: QmsMetrologyApi.MetrologyItem[] = [];
  let total = 0;
  let page = 1;
  do {
    const result = await getMetrologyListPage({ page, pageSize: 100 });
    total = result.total;
    if (result.items.length === 0 && items.length < total) {
      throw new Error('Instrument catalog pagination did not advance');
    }
    items.push(...result.items);
    page++;
  } while (items.length < total);
  return items.map((item) => ({
    label: `${item.instrumentName} / ${item.instrumentCode}`,
    value: item.id,
  }));
}
