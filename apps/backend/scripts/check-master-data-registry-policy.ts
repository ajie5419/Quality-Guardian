import process from 'node:process';

import { listMasterDataGovernanceFields } from '../core/master-data/governance-registry';

type PolicyIssueCode =
  | 'audit-policy-mismatch-with-canonical'
  | 'backfill-policy-mismatch-with-canonical'
  | 'canonical-field-missing-id-column-target'
  | 'canonical-field-write-strategy-mismatch'
  | 'canonical-first-without-canonical'
  | 'duplicate-field-key'
  | 'name-only-field-has-id-column-target'
  | 'target-name-column-duplicated';

interface PolicyIssue {
  code: PolicyIssueCode;
  detail: string;
  fieldKey: string;
}

function collectRegistryPolicyIssues() {
  const fields = listMasterDataGovernanceFields();
  const issues: PolicyIssue[] = [];
  const keySet = new Set<string>();

  for (const field of fields) {
    const fieldKey = field.key;
    if (keySet.has(fieldKey)) {
      issues.push({
        code: 'duplicate-field-key',
        fieldKey,
        detail: 'Field key must be unique across registry.',
      });
      continue;
    }
    keySet.add(fieldKey);

    const hasCanonical = Boolean(field.canonical);
    const hasAnyIdTarget = field.targets.some((target) =>
      Boolean(target.idColumn),
    );
    const hasDuplicateTargetNameColumn = (() => {
      const targetSet = new Set<string>();
      for (const target of field.targets) {
        const token = `${target.table}::${target.nameColumn}`;
        if (targetSet.has(token)) return true;
        targetSet.add(token);
      }
      return false;
    })();

    if (hasDuplicateTargetNameColumn) {
      issues.push({
        code: 'target-name-column-duplicated',
        fieldKey,
        detail:
          'Target table/nameColumn pair must be unique inside the same field config.',
      });
    }

    if (field.readStrategy === 'canonical-first' && !hasCanonical) {
      issues.push({
        code: 'canonical-first-without-canonical',
        fieldKey,
        detail: 'canonical-first read strategy requires canonical relation.',
      });
    }

    if (hasCanonical && field.writeStrategy !== 'dual-write') {
      issues.push({
        code: 'canonical-field-write-strategy-mismatch',
        fieldKey,
        detail: 'Fields with canonical relation must use dual-write.',
      });
    }

    if (hasCanonical && !hasAnyIdTarget) {
      issues.push({
        code: 'canonical-field-missing-id-column-target',
        fieldKey,
        detail:
          'Fields with canonical relation must declare at least one target idColumn.',
      });
    }

    if (hasCanonical && field.backfillPolicy !== 'canonical-id') {
      issues.push({
        code: 'backfill-policy-mismatch-with-canonical',
        fieldKey,
        detail:
          'Fields with canonical relation must set backfillPolicy=canonical-id.',
      });
    }

    if (!hasCanonical && field.backfillPolicy !== 'none') {
      issues.push({
        code: 'backfill-policy-mismatch-with-canonical',
        fieldKey,
        detail:
          'Fields without canonical relation must set backfillPolicy=none.',
      });
    }

    if (hasCanonical && field.auditPolicy !== 'canonical-id-and-orphan') {
      issues.push({
        code: 'audit-policy-mismatch-with-canonical',
        fieldKey,
        detail:
          'Fields with canonical relation must set auditPolicy=canonical-id-and-orphan.',
      });
    }

    if (!hasCanonical && field.auditPolicy !== 'orphan-only') {
      issues.push({
        code: 'audit-policy-mismatch-with-canonical',
        fieldKey,
        detail:
          'Fields without canonical relation must set auditPolicy=orphan-only.',
      });
    }

    if (!hasCanonical && hasAnyIdTarget) {
      issues.push({
        code: 'name-only-field-has-id-column-target',
        fieldKey,
        detail:
          'Fields without canonical relation must not declare idColumn targets.',
      });
    }
  }

  return {
    fields,
    issues,
  };
}

async function main() {
  const { fields, issues } = collectRegistryPolicyIssues();
  const summary = {
    generatedAt: new Date().toISOString(),
    totals: {
      fields: fields.length,
      issues: issues.length,
    },
    issues,
  };

  console.warn('[check-master-data-registry-policy] result');
  console.warn(JSON.stringify(summary, null, 2));

  if (issues.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error('[check-master-data-registry-policy] failed', error);
  process.exitCode = 1;
});
