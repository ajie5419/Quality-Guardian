/**
 * Local device receipts for anonymously submitted inspection requests.
 * A scanned entry has no identity, so "my reports" falls back to the
 * receipts stored on this device; signed-in users additionally see the
 * server-side reporter scope (merged in MyInspectionRequests.vue).
 */
export interface LocalInspectionReceipt {
  partName: string;
  processName: string;
  requestNo: string;
  submittedAt: string;
  workOrderNumber: string;
}

export const MY_INSPECTION_RECEIPTS_KEY = 'qg-my-inspection-requests';
const MAX_RECEIPTS = 20;

export function readLocalInspectionReceipts(): LocalInspectionReceipt[] {
  try {
    const raw = window.localStorage.getItem(MY_INSPECTION_RECEIPTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is LocalInspectionReceipt =>
        !!item &&
        typeof item.requestNo === 'string' &&
        typeof item.partName === 'string' &&
        typeof item.processName === 'string' &&
        typeof item.workOrderNumber === 'string',
    );
  } catch {
    return [];
  }
}

export function saveLocalInspectionReceipt(
  receipt: LocalInspectionReceipt,
): LocalInspectionReceipt[] {
  const next = [
    receipt,
    ...readLocalInspectionReceipts().filter(
      (item) => item.requestNo !== receipt.requestNo,
    ),
  ].slice(0, MAX_RECEIPTS);
  try {
    window.localStorage.setItem(
      MY_INSPECTION_RECEIPTS_KEY,
      JSON.stringify(next),
    );
  } catch {
    // Storage may be unavailable (private mode); receipts are best-effort.
  }
  return next;
}
