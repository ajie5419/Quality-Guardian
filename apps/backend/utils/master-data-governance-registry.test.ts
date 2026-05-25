import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  getMasterDataGovernanceField,
  getMasterDataGovernanceFieldKeys,
  listMasterDataGovernanceFields,
  listMasterDataGovernanceFieldsByWave,
  listMasterDataGovernanceWaves,
} from './master-data-governance-registry';

interface BacklogDecisionConfig {
  decisions?: Array<{
    key?: string;
    status?: string;
  }>;
}

const REQUIRED_SUPERVISION_EXCLUDED_KEYS = [
  'supervision_issues.issueType',
  'supervision_issue_actions.actionType',
  'supervision_projects.projectType',
  'supervision_projects.participants',
  'supervision_plan_tasks.taskName',
  'supervision_plan_tasks.resourceName',
  'supervision_plan_tasks.riskReason',
] as const;
const CURRENT_DIR = path.dirname(fileURLToPath(import.meta.url));

describe('master-data-governance-registry', () => {
  it('contains all configured field keys', () => {
    const keys = getMasterDataGovernanceFieldKeys();
    expect(keys).toEqual([
      'processName',
      'team',
      'defectType',
      'defectSubtype',
      'division',
      'customerName',
      'productType',
      'productSubtype',
      'failureType',
      'failureCause',
      'supplierBrand',
      'qualityLossType',
      'incomingType',
      'materialName',
      'componentName',
      'requirementName',
      'responsibleTeam',
      'borrowerName',
      'supplierEntityName',
      'supplierProductName',
      'supplierProject',
      'rootCause',
      'qualityRecordCategory',
      'supplierCategory',
      'taskDispatchType',
      'supplierName',
      'responsibleDepartment',
      'projectName',
      'dfmeaCause',
      'inspectionFormName',
      'itpProcessStep',
      'instrumentName',
      'supervisionIssueType',
      'supervisionIssueActionType',
      'supervisionProjectType',
      'standardDocumentCategory',
      'bomPartNumber',
      'bomRequiredProcesses',
      'partName',
      'weldersName',
      'rolesName',
      'sequencesName',
      'standardDocumentName',
      'userUsername',
      'userRealName',
      'userDepartment',
      'knowledgeCategoryName',
    ]);
  });

  it('returns wave 1 fields', () => {
    const wave1 = listMasterDataGovernanceFieldsByWave(1).map(
      (item) => item.key,
    );
    expect(wave1).toEqual([
      'team',
      'defectType',
      'defectSubtype',
      'division',
      'customerName',
      'productType',
      'productSubtype',
      'failureType',
      'failureCause',
    ]);
  });

  it('returns wave 2 fields', () => {
    const wave2 = listMasterDataGovernanceFieldsByWave(2).map(
      (item) => item.key,
    );
    expect(wave2).toEqual([
      'supplierBrand',
      'qualityLossType',
      'responsibleTeam',
      'borrowerName',
      'supplierEntityName',
      'supplierProductName',
      'supplierProject',
      'rootCause',
      'qualityRecordCategory',
      'supplierCategory',
      'taskDispatchType',
      'supplierName',
      'responsibleDepartment',
      'dfmeaCause',
      'inspectionFormName',
      'itpProcessStep',
      'instrumentName',
      'supervisionIssueType',
      'supervisionIssueActionType',
      'supervisionProjectType',
      'standardDocumentCategory',
    ]);
  });

  it('returns sorted rollout waves', () => {
    expect(listMasterDataGovernanceWaves()).toEqual([0, 1, 2, 3, 7, 8]);
  });

  it('processName is canonical field and dual-write', () => {
    const field = getMasterDataGovernanceField('processName');
    expect(field?.canonical?.table).toBe('processes');
    expect(field?.writeStrategy).toBe('dual-write');
    expect(field?.readStrategy).toBe('canonical-first');
  });

  it('wave3 project/part fields are canonical-enabled with dual-write', () => {
    const projectField = getMasterDataGovernanceField('projectName');
    const partField = getMasterDataGovernanceField('partName');

    expect(projectField?.canonical?.table).toBe('master_projects');
    expect(projectField?.writeStrategy).toBe('dual-write');
    expect(projectField?.backfillPolicy).toBe('canonical-id');
    expect(projectField?.auditPolicy).toBe('canonical-id-and-orphan');
    expect(projectField?.targets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: 'work_orders',
          nameColumn: 'projectName',
          idColumn: 'projectId',
        }),
      ]),
    );

    expect(partField?.canonical?.table).toBe('master_parts');
    expect(partField?.writeStrategy).toBe('dual-write');
    expect(partField?.backfillPolicy).toBe('canonical-id');
    expect(partField?.auditPolicy).toBe('canonical-id-and-orphan');
    expect(partField?.targets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: 'project_boms',
          nameColumn: 'part_name',
          idColumn: 'partId',
        }),
      ]),
    );
  });

  it('wave1 after-sales product/failure fields are canonical-enabled with dictionaries', () => {
    const productType = getMasterDataGovernanceField('productType');
    const productSubtype = getMasterDataGovernanceField('productSubtype');
    const failureType = getMasterDataGovernanceField('failureType');
    const failureCause = getMasterDataGovernanceField('failureCause');

    for (const field of [
      productType,
      productSubtype,
      failureType,
      failureCause,
    ]) {
      expect(field?.writeStrategy).toBe('dual-write');
      expect(field?.readStrategy).toBe('canonical-first');
      expect(field?.backfillPolicy).toBe('canonical-id');
      expect(field?.auditPolicy).toBe('canonical-id-and-orphan');
      expect(field?.canonical?.table).toBe('dictionaries');
      expect(field?.canonical?.idColumn).toBe('id');
      expect(field?.canonical?.nameColumn).toBe('dictKey');
      expect(field?.targets).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            table: 'after_sales',
          }),
        ]),
      );
    }

    expect(productType?.source).toEqual({
      type: 'dictionary',
      dictType: 'product_type',
    });
    expect(productSubtype?.source).toEqual({
      type: 'dictionary',
      dictType: 'product_subtype',
    });
    expect(failureType?.source).toEqual({
      type: 'dictionary',
      dictType: 'failure_type',
    });
    expect(failureCause?.source).toEqual({
      type: 'dictionary',
      dictType: 'failure_cause',
    });
    expect(productType?.targets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: 'after_sales',
          nameColumn: 'productType',
          idColumn: 'productTypeId',
        }),
      ]),
    );
    expect(productSubtype?.targets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: 'after_sales',
          nameColumn: 'productSubtype',
          idColumn: 'productSubtypeId',
        }),
      ]),
    );
    expect(failureType?.targets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: 'after_sales',
          nameColumn: 'failureType',
          idColumn: 'failureTypeId',
        }),
      ]),
    );
    expect(failureCause?.targets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: 'after_sales',
          nameColumn: 'failureCause',
          idColumn: 'failureCauseId',
        }),
      ]),
    );
  });

  it('wave2 responsibleTeam/supplierProductName/supplierProject/rootCause are canonical-enabled with dictionaries', () => {
    const responsibleTeam = getMasterDataGovernanceField('responsibleTeam');
    const supplierProductName = getMasterDataGovernanceField(
      'supplierProductName',
    );
    const supplierProject = getMasterDataGovernanceField('supplierProject');
    const rootCause = getMasterDataGovernanceField('rootCause');

    for (const field of [
      responsibleTeam,
      supplierProductName,
      supplierProject,
      rootCause,
    ]) {
      expect(field?.writeStrategy).toBe('dual-write');
      expect(field?.readStrategy).toBe('canonical-first');
      expect(field?.backfillPolicy).toBe('canonical-id');
      expect(field?.auditPolicy).toBe('canonical-id-and-orphan');
      expect(field?.canonical?.table).toBe('dictionaries');
      expect(field?.canonical?.idColumn).toBe('id');
      expect(field?.canonical?.nameColumn).toBe('dictKey');
    }

    expect(responsibleTeam?.source).toEqual({
      type: 'dictionary',
      dictType: 'team',
    });
    expect(supplierProductName?.source).toEqual({
      type: 'dictionary',
      dictType: 'supplier_product_name',
    });
    expect(supplierProject?.source).toEqual({
      type: 'dictionary',
      dictType: 'supplier_project',
    });
    expect(rootCause?.source).toEqual({
      type: 'dictionary',
      dictType: 'root_cause',
    });
    expect(responsibleTeam?.targets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: 'work_order_requirements',
          nameColumn: 'responsibleTeam',
          idColumn: 'responsibleTeamId',
        }),
      ]),
    );
    expect(supplierProductName?.targets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: 'suppliers',
          nameColumn: 'productName',
          idColumn: 'productNameId',
        }),
      ]),
    );
    expect(supplierProject?.targets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: 'suppliers',
          nameColumn: 'project',
          idColumn: 'projectId',
        }),
      ]),
    );
    expect(rootCause?.targets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: 'quality_records',
          nameColumn: 'rootCause',
          idColumn: 'rootCauseId',
        }),
      ]),
    );
  });

  it('wave2 supplierBrand/borrowerName are canonical-enabled with dictionaries', () => {
    const supplierBrand = getMasterDataGovernanceField('supplierBrand');
    const borrowerName = getMasterDataGovernanceField('borrowerName');

    for (const field of [supplierBrand, borrowerName]) {
      expect(field?.writeStrategy).toBe('dual-write');
      expect(field?.readStrategy).toBe('canonical-first');
      expect(field?.backfillPolicy).toBe('canonical-id');
      expect(field?.auditPolicy).toBe('canonical-id-and-orphan');
      expect(field?.canonical?.table).toBe('dictionaries');
      expect(field?.canonical?.idColumn).toBe('id');
      expect(field?.canonical?.nameColumn).toBe('dictKey');
    }

    expect(supplierBrand?.source).toEqual({
      type: 'dictionary',
      dictType: 'supplier_brand',
    });
    expect(borrowerName?.source).toEqual({
      type: 'dictionary',
      dictType: 'borrower_name',
    });
    expect(supplierBrand?.targets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: 'after_sales',
          nameColumn: 'supplierBrand',
          idColumn: 'supplierBrandId',
        }),
      ]),
    );
    expect(borrowerName?.targets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: 'metrology_borrow_records',
          nameColumn: 'borrowerName',
          idColumn: 'borrowerNameId',
        }),
      ]),
    );
  });

  it('wave10 decision: division/customerName/supplierEntityName are upgraded to canonical dual-write', () => {
    const division = getMasterDataGovernanceField('division');
    const customerName = getMasterDataGovernanceField('customerName');
    const supplierEntityName =
      getMasterDataGovernanceField('supplierEntityName');

    for (const field of [division, customerName, supplierEntityName]) {
      expect(field?.writeStrategy).toBe('dual-write');
      expect(field?.readStrategy).toBe('canonical-first');
      expect(field?.backfillPolicy).toBe('canonical-id');
      expect(field?.auditPolicy).toBe('canonical-id-and-orphan');
      expect(field?.canonical?.table).toBe('dictionaries');
      expect(field?.canonical?.idColumn).toBe('id');
      expect(field?.canonical?.nameColumn).toBe('dictKey');
    }

    expect(division?.source).toEqual({
      type: 'dictionary',
      dictType: 'division',
    });
    expect(division?.targets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: 'work_orders',
          nameColumn: 'division',
          idColumn: 'divisionId',
        }),
        expect.objectContaining({
          table: 'quality_records',
          nameColumn: 'division',
          idColumn: 'divisionId',
        }),
        expect.objectContaining({
          table: 'after_sales',
          nameColumn: 'division',
          idColumn: 'divisionId',
        }),
      ]),
    );

    expect(customerName?.source).toEqual({
      type: 'dictionary',
      dictType: 'customer_name',
    });
    expect(customerName?.targets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: 'work_orders',
          nameColumn: 'customerName',
          idColumn: 'customerNameId',
        }),
        expect.objectContaining({
          table: 'after_sales',
          nameColumn: 'customerName',
          idColumn: 'customerNameId',
        }),
        expect.objectContaining({
          table: 'quality_plans',
          nameColumn: 'customer',
          idColumn: 'customerId',
        }),
      ]),
    );

    expect(supplierEntityName?.source).toEqual({
      type: 'dictionary',
      dictType: 'supplier_entity_name',
    });
    expect(supplierEntityName?.targets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: 'suppliers',
          nameColumn: 'name',
          idColumn: 'nameId',
        }),
      ]),
    );
  });

  it('all fields have source and at least one target', () => {
    const fields = listMasterDataGovernanceFields();
    for (const field of fields) {
      expect(field.source).toBeTruthy();
      expect(field.targets.length).toBeGreaterThan(0);
    }
  });

  it('partName covers project_boms snake_case target', () => {
    const field = getMasterDataGovernanceField('partName');
    expect(field?.targets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: 'project_boms',
          nameColumn: 'part_name',
        }),
      ]),
    );
  });

  it('bom fields cover project_boms number/process columns', () => {
    const bomPartNumber = getMasterDataGovernanceField('bomPartNumber');
    const bomRequiredProcesses = getMasterDataGovernanceField(
      'bomRequiredProcesses',
    );
    expect(bomPartNumber?.targets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: 'project_boms',
          nameColumn: 'part_number',
        }),
      ]),
    );
    expect(bomRequiredProcesses?.targets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: 'project_boms',
          nameColumn: 'required_processes',
        }),
      ]),
    );
  });

  it('wave10 decision: bom fields remain name-only and excluded from canonicalization', () => {
    const bomPartNumber = getMasterDataGovernanceField('bomPartNumber');
    const bomRequiredProcesses = getMasterDataGovernanceField(
      'bomRequiredProcesses',
    );

    for (const field of [bomPartNumber, bomRequiredProcesses]) {
      expect(field?.writeStrategy).toBe('name-only');
      expect(field?.readStrategy).toBe('name-only');
      expect(field?.backfillPolicy).toBe('none');
      expect(field?.auditPolicy).toBe('orphan-only');
      expect(field?.canonical).toBeUndefined();
      expect(field?.targets.every((target) => !target.idColumn)).toBe(true);
    }
  });

  it('wave10 visibility: quantified template metrics are internally consistent', () => {
    const fields = listMasterDataGovernanceFields();
    const canonicalFields = fields.filter((field) => Boolean(field.canonical));
    const nameOnlyFields = fields.filter(
      (field) => field.readStrategy === 'name-only',
    );

    expect(fields.length).toBeGreaterThan(0);
    expect(canonicalFields.length + nameOnlyFields.length).toBe(fields.length);
  });

  it('keeps 7 supervision exclusion keys as excluded in backlog config', () => {
    const configPath = path.resolve(
      CURRENT_DIR,
      '..',
      'config',
      'master-data-governance-backlog.json',
    );
    const config = JSON.parse(
      fs.readFileSync(configPath, 'utf8'),
    ) as BacklogDecisionConfig;
    const statusByKey = new Map(
      (config.decisions || [])
        .map((item) => ({
          key: String(item.key || '').trim(),
          status: String(item.status || '').trim(),
        }))
        .filter((item) => Boolean(item.key))
        .map((item) => [item.key, item.status]),
    );

    for (const key of REQUIRED_SUPERVISION_EXCLUDED_KEYS) {
      expect(statusByKey.get(key)).toBe('excluded');
    }
  });

  it('covers standard-document fields', () => {
    const documentCategory = getMasterDataGovernanceField(
      'standardDocumentCategory',
    );
    expect(documentCategory?.targets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: 'standard_documents',
          nameColumn: 'category',
        }),
      ]),
    );
  });
});
