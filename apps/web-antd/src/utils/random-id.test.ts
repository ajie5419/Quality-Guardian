import { afterEach, describe, expect, it, vi } from 'vitest';

import { randomUuid } from './random-id';

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('randomUuid', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns a v4 UUID when randomUUID is available', () => {
    expect(randomUuid()).toMatch(UUID_V4);
  });

  it('falls back to getRandomValues on insecure (plain HTTP) pages', () => {
    const { getRandomValues } = crypto;
    vi.stubGlobal('crypto', {
      getRandomValues: getRandomValues.bind(crypto),
    });
    const ids = new Set(Array.from({ length: 50 }, () => randomUuid()));
    expect(ids.size).toBe(50);
    for (const id of ids) {
      expect(id).toMatch(UUID_V4);
    }
  });
});
