import { describe, expect, it } from 'vitest';

import {
  workOrderRequirementCreateBodySchema,
  workOrderRequirementMutationBodySchema,
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

  it('accepts distinct confirmation and editable payloads', () => {
    expect(
      workOrderRequirementMutationBodySchema.parse({ confirm: true }),
    ).toEqual({ confirm: true });
    expect(
      workOrderRequirementMutationBodySchema.parse({
        attachments: [],
        items: ['Point A'],
        requirementName: 'Visual inspection',
        responsibleTeam: null,
        responsibleTeamId: null,
      }),
    ).toMatchObject({
      attachments: [],
      items: ['Point A'],
      responsibleTeam: null,
      responsibleTeamId: null,
    });
  });

  it('rejects mixed confirmation and edit payloads', () => {
    expect(
      workOrderRequirementMutationBodySchema.safeParse({
        confirm: true,
        requirementName: 'Unexpected edit',
      }).success,
    ).toBe(false);
  });
});
