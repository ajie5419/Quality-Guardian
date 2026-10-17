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

  it('accepts the canonical weldingMethod field', () => {
    const result = welderCreateBodySchema.parse({
      name: 'Alice',
      team: 'Assembly Team',
      teamId: 'team-1',
      weldingMethod: 'SMAW',
    });

    expect(result).toMatchObject({ weldingMethod: 'SMAW' });
  });

  it('rejects unknown keys such as the legacy welding_method field', () => {
    expect(
      welderCreateBodySchema.safeParse({
        name: 'Alice',
        team: 'Assembly Team',
        teamId: 'team-1',
        welding_method: 'SMAW',
      }).success,
    ).toBe(false);
    expect(
      welderUpdateBodySchema.safeParse({
        team: 'Assembly Team',
        teamId: 'team-1',
        welding_method: 'SMAW',
      }).success,
    ).toBe(false);
  });
});
