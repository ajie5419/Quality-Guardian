import { afterEach, describe, expect, it, vi } from 'vitest';

import { randomUuid } from './random-uuid';

const V4 = /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/;

describe('randomUuid', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses crypto.randomUUID when available', () => {
    expect(randomUuid()).toMatch(V4);
  });

  it('falls back to getRandomValues outside secure contexts', () => {
    const { getRandomValues } = globalThis.crypto;
    vi.stubGlobal('crypto', {
      getRandomValues: getRandomValues.bind(globalThis.crypto),
    });
    const a = randomUuid();
    const b = randomUuid();
    expect(a).toMatch(V4);
    expect(b).toMatch(V4);
    expect(a).not.toBe(b);
  });
});
