import { describe, expect, it } from 'vitest';

import { getAnalyticsAccessContext } from './current-user';

describe('getAnalyticsAccessContext', () => {
  it('preserves the middleware-resolved DataScope', () => {
    const dataScope = {
      deptIds: ['dept-quality'],
      module: 'inspection',
      scopeType: 'DEPT' as const,
    };
    const event = {
      context: {
        dataScope,
        user: { id: 'user-1', username: 'inspector' },
      },
    } as never;

    expect(getAnalyticsAccessContext(event)).toEqual({
      dataScope,
      user: { userId: 'user-1', username: 'inspector' },
    });
  });
});
