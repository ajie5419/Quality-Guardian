import { describe, expect, it } from 'vitest';

import {
  workOrderRequirementCreateBodySchema,
  workOrderRequirementUpdateBodySchema,
} from './work-order-requirement.schema';

describe('work order requirement schemas', () => {
  it('accepts responsible team ID and display name together', () => {
    const result = workOrderRequirementCreateBodySchema.parse({
      requirements: [
        {
          requirementName: 'Visual inspection',
          responsibleTeam: 'Assembly Team',
          responsibleTeamId: 'team-1',
          workOrderNumber: 'WO-001',
        },
      ],
    });

    expect(result).toMatchObject({
      requirements: [
        {
          responsibleTeam: 'Assembly Team',
          responsibleTeamId: 'team-1',
        },
      ],
    });
  });

  it('rejects create and update payloads with incomplete team identity', () => {
    expect(
      workOrderRequirementCreateBodySchema.safeParse({
        requirementName: 'Visual inspection',
        responsibleTeam: 'Assembly Team',
        workOrderNumber: 'WO-001',
      }).success,
    ).toBe(false);
    expect(
      workOrderRequirementUpdateBodySchema.safeParse({
        responsibleTeamId: 'team-1',
      }).success,
    ).toBe(false);
  });
});
