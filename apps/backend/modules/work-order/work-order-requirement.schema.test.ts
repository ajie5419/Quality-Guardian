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
          identityContractVersion: 2,
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
        identityContractVersion: 2,
        requirementName: 'Visual inspection',
        responsibleTeam: 'Assembly Team',
        workOrderNumber: 'WO-001',
      }).success,
    ).toBe(false);
    expect(
      workOrderRequirementUpdateBodySchema.safeParse({
        identityContractVersion: 2,
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
        identityContractVersion: 2,
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

  it('accepts V2 canonical IDs and rejects client-controlled names', () => {
    expect(
      workOrderRequirementCreateBodySchema.safeParse({
        identityContractVersion: 2,
        partId: 'part-1',
        processId: 'process-1',
        requirementName: 'Visual inspection',
        workOrderNumber: 'WO-001',
      }).success,
    ).toBe(true);
    expect(
      workOrderRequirementCreateBodySchema.safeParse({
        identityContractVersion: 2,
        partId: 'part-1',
        partName: 'Client snapshot',
        requirementName: 'Visual inspection',
        workOrderNumber: 'WO-001',
      }).success,
    ).toBe(false);
    expect(
      workOrderRequirementUpdateBodySchema.safeParse({
        identityContractVersion: 2,
        partId: 'part-1',
        partName: 'Client snapshot',
      }).success,
    ).toBe(false);
  });

  it('requires the V2 identity contract for create and edit writes', () => {
    expect(
      workOrderRequirementCreateBodySchema.safeParse({
        requirementName: 'Visual inspection',
        workOrderNumber: 'WO-001',
      }).success,
    ).toBe(false);
    expect(
      workOrderRequirementUpdateBodySchema.safeParse({
        requirementName: 'Visual inspection',
      }).success,
    ).toBe(false);
  });

  it('rejects an edit containing only the contract marker', () => {
    expect(
      workOrderRequirementUpdateBodySchema.safeParse({
        identityContractVersion: 2,
      }).success,
    ).toBe(false);
  });
});
