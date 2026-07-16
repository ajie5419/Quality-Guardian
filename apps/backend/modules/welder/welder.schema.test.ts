import { describe, expect, it } from 'vitest';

import {
  welderCreateBodySchema,
  welderUpdateBodySchema,
} from './welder.schema';

describe('welder schemas', () => {
  it('accepts a canonical team ID with its display name', () => {
    const result = welderCreateBodySchema.parse({
      name: 'Alice',
      team: 'Assembly Team',
      teamId: 'team-1',
    });

    expect(result).toMatchObject({
      team: 'Assembly Team',
      teamId: 'team-1',
    });
  });

  it('rejects updates containing only one team identity field', () => {
    expect(
      welderUpdateBodySchema.safeParse({ team: 'Assembly Team' }).success,
    ).toBe(false);
    expect(welderUpdateBodySchema.safeParse({ teamId: 'team-1' }).success).toBe(
      false,
    );
  });
});
