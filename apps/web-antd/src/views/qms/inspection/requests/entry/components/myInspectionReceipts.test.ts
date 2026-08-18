import { beforeEach, describe, expect, it } from 'vitest';

import {
  MY_INSPECTION_RECEIPTS_KEY,
  readLocalInspectionReceipts,
  saveLocalInspectionReceipt,
} from './myInspectionReceipts';

const storage = new Map<string, string>();

beforeEach(() => {
  storage.clear();
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => storage.get(key) ?? null,
      removeItem: (key: string) => storage.delete(key),
      setItem: (key: string, value: string) => storage.set(key, value),
    },
  });
});

describe('local inspection receipts', () => {
  it('returns an empty list without stored receipts', () => {
    expect(readLocalInspectionReceipts()).toEqual([]);
  });

  it('stores a receipt and reads it back', () => {
    saveLocalInspectionReceipt({
      partName: '部件A',
      processName: '外购件',
      requestNo: 'IR-20260818-0001',
      submittedAt: '2026-08-18T02:00:00.000Z',
      workOrderNumber: 'WO-1',
    });
    expect(readLocalInspectionReceipts()[0]).toMatchObject({
      requestNo: 'IR-20260818-0001',
    });
  });

  it('deduplicates by request number with the newest first', () => {
    saveLocalInspectionReceipt({
      partName: 'A',
      processName: 'P',
      requestNo: 'IR-1',
      submittedAt: '2026-08-18T02:00:00.000Z',
      workOrderNumber: 'WO',
    });
    saveLocalInspectionReceipt({
      partName: 'B',
      processName: 'P',
      requestNo: 'IR-2',
      submittedAt: '2026-08-18T03:00:00.000Z',
      workOrderNumber: 'WO',
    });
    saveLocalInspectionReceipt({
      partName: 'A2',
      processName: 'P',
      requestNo: 'IR-1',
      submittedAt: '2026-08-18T04:00:00.000Z',
      workOrderNumber: 'WO',
    });
    const receipts = readLocalInspectionReceipts();
    expect(receipts.map((item) => item.requestNo)).toEqual(['IR-1', 'IR-2']);
    expect(receipts[0]?.partName).toBe('A2');
  });

  it('ignores corrupted storage content', () => {
    storage.set(MY_INSPECTION_RECEIPTS_KEY, '{not-json');
    expect(readLocalInspectionReceipts()).toEqual([]);
  });
});
