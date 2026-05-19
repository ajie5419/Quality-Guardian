import { describe, expect, it } from 'vitest';

import {
  useListResponseSuccess,
  usePageResponseSuccess,
  useResponseSuccess,
} from './response';

describe('response utils', () => {
  it('wraps success data with the standard envelope', () => {
    expect(useResponseSuccess({ ok: true })).toEqual({
      code: 0,
      data: { ok: true },
      error: null,
      message: 'ok',
    });
  });

  it('wraps list data using the standard items and total shape', () => {
    expect(useListResponseSuccess(['A', 'B'])).toEqual({
      code: 0,
      data: {
        items: ['A', 'B'],
        total: 2,
      },
      error: null,
      message: 'ok',
    });
  });

  it('uses explicit total for pre-paginated list data', () => {
    expect(useListResponseSuccess(['A'], { total: 10 })).toEqual({
      code: 0,
      data: {
        items: ['A'],
        total: 10,
      },
      error: null,
      message: 'ok',
    });
  });

  it('keeps page response pagination behavior unchanged', () => {
    expect(usePageResponseSuccess(2, 2, ['A', 'B', 'C'])).toEqual({
      code: 0,
      data: {
        items: ['C'],
        total: 3,
      },
      error: null,
      message: 'ok',
    });
  });
});
