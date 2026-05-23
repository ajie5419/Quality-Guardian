import { describe, expect, it } from 'vitest';

import {
  classifyExcludedByDecisionNote,
  summarizeExcludedBreakdown,
} from './export-master-data-governance-backlog';

describe('export-master-data-governance-backlog excluded note classification', () => {
  it('classifies excluded backlog notes into expected categories', () => {
    const notes = [
      'Business-excluded by product decision; not governed by master-data canonicalization scope.',
      'System menu metadata, not business master-data field.',
      'Canonical source entity primary label; excluded from propagated target-field backlog.',
      'Covered by governance field projectName with quality_plans.projectName target.',
      'Document title field; business canonicalization value is low and not in current rollout scope.',
    ];

    const breakdown = summarizeExcludedBreakdown(notes);

    expect(breakdown).toEqual({
      business_excluded: 2,
      system_metadata: 1,
      canonical_source: 1,
      covered_by_governance: 1,
      other: 0,
    });
    expect(
      breakdown.business_excluded +
        breakdown.system_metadata +
        breakdown.canonical_source +
        breakdown.covered_by_governance +
        breakdown.other,
    ).toBe(notes.length);
  });

  it('maps unknown notes to other', () => {
    expect(
      classifyExcludedByDecisionNote(
        'No explicit decision note pattern appears.',
      ),
    ).toBe('other');
  });
});
