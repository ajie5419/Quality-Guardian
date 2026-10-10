import type { Page } from '@playwright/test';

import process from 'node:process';

/**
 * The backend rejects an identical write again until its dedupe window
 * expires. Production uses 3000ms; the isolated E2E backend shortens it and
 * publishes the effective value, so specs never hardcode a duration.
 */
const DEFAULT_DEDUPE_WINDOW_MS = 3000;

export function dedupeWindowMs() {
  const parsed = Number(process.env.QGS_E2E_DEDUPE_WINDOW_MS);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return DEFAULT_DEDUPE_WINDOW_MS;
  }
  return parsed;
}

/**
 * Waits past the dedupe window so the next identical write is expected to be
 * replayed by the business idempotency engine rather than fast-rejected.
 */
export async function waitOutDedupeWindow(page: Page) {
  // Extra headroom absorbs the round trip between the window closing and the
  // click landing, which is what the previous fixed 3500ms literals encoded.
  await page.waitForTimeout(dedupeWindowMs() + 500);
}

/**
 * Blocks until the window opened by `lastWriteAt` has closed. Keeps the
 * "window expires" guarantee without paying the full window up front.
 */
export function remainingDedupeWait(lastWriteAt: number | undefined) {
  if (!lastWriteAt) return 0;
  return Math.max(0, lastWriteAt + dedupeWindowMs() - Date.now());
}
