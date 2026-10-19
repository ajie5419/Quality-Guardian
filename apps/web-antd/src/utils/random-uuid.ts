/**
 * RFC 4122 v4 UUID that also works outside secure contexts.
 *
 * `crypto.randomUUID` exists only on HTTPS or localhost; production served
 * over plain HTTP has `crypto.getRandomValues` but not `randomUUID`, so
 * calling it directly throws before the request is ever sent.
 */
export function randomUuid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const hex = Array.from(bytes, (b, i) => {
    // Version 4 in byte 6, RFC 4122 variant in byte 8.
    if (i === 6) b = (b & 15) | 64;
    if (i === 8) b = (b & 63) | 128;
    return b.toString(16).padStart(2, '0');
  });
  return [
    hex.slice(0, 4).join(''),
    hex.slice(4, 6).join(''),
    hex.slice(6, 8).join(''),
    hex.slice(8, 10).join(''),
    hex.slice(10, 16).join(''),
  ].join('-');
}
