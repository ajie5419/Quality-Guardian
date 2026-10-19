/**
 * RFC 4122 v4 UUID that also works on plain-HTTP pages.
 *
 * `crypto.randomUUID()` only exists in secure contexts (HTTPS or localhost),
 * so calling it on an `http://<ip>` deployment throws before any request is
 * sent. `crypto.getRandomValues()` is available in every context, so it is
 * the fallback. Use this helper instead of `crypto.randomUUID()` in the web
 * app (enforced by lint).
 */
export function randomUuid(): string {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  // Version 4 (byte 6 high nibble = 0100) and RFC 4122 variant (byte 8 = 10xx).
  bytes[6] = ((bytes[6] ?? 0) & 15) | 64;
  bytes[8] = ((bytes[8] ?? 0) & 63) | 128;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0'));
  return [
    hex.slice(0, 4).join(''),
    hex.slice(4, 6).join(''),
    hex.slice(6, 8).join(''),
    hex.slice(8, 10).join(''),
    hex.slice(10, 16).join(''),
  ].join('-');
}
