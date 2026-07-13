import { describe, expect, it } from 'vitest';

import { sanitizeQueryData } from './request';

describe('sanitizeQueryData', () => {
  it('omits undefined query values', () => {
    expect(
      sanitizeQueryData({
        page: 1,
        status: undefined,
        workOrderNumber: undefined,
      }),
    ).toEqual({ page: 1 });
  });

  it('preserves valid falsy query values', () => {
    expect(
      sanitizeQueryData({
        keyword: '',
        mine: false,
        page: 0,
      }),
    ).toEqual({ keyword: '', mine: false, page: 0 });
  });
});
