export type MasterDataSource =
  | {
      description: string;
      type: 'derived';
      valueSql: string;
    }
  | {
      dictType: string;
      type: 'dictionary';
    }
  | {
      table: string;
      type: 'table';
      valueColumn: string;
      where?: string;
    };

export interface MasterDataCanonicalRelation {
  activeWhere?: string;
  idColumn: string;
  nameColumn: string;
  table: string;
}

export interface MasterDataTarget {
  idColumn?: string;
  nameColumn: string;
  nullable: boolean;
  table: string;
}

export interface MasterDataGovernanceField {
  auditPolicy: 'canonical-id-and-orphan' | 'orphan-only';
  backfillPolicy: 'canonical-id' | 'none';
  key: string;
  readStrategy: 'canonical-first' | 'name-only';
  rolloutWave: number;
  requiresDerivedRuleFreeze?: boolean;
  source: MasterDataSource;
  targets: MasterDataTarget[];
  writeStrategy: 'dual-write' | 'name-only';
  canonical?: MasterDataCanonicalRelation;
}

const MASTER_DATA_FIELDS: MasterDataGovernanceField[] = [
  {
    key: 'processName',
    rolloutWave: 0,
    writeStrategy: 'dual-write',
    readStrategy: 'canonical-first',
    backfillPolicy: 'canonical-id',
    auditPolicy: 'canonical-id-and-orphan',
    source: {
      type: 'dictionary',
      dictType: 'inspection_process_name',
    },
    canonical: {
      table: 'processes',
      idColumn: 'id',
      nameColumn: 'name',
      activeWhere: 'isDeleted = 0',
    },
    targets: [
      {
        table: 'inspections',
        nameColumn: 'processName',
        idColumn: 'processId',
        nullable: true,
      },
      {
        table: 'quality_records',
        nameColumn: 'processName',
        idColumn: 'processId',
        nullable: true,
      },
      {
        table: 'work_order_requirements',
        nameColumn: 'processName',
        idColumn: 'processId',
        nullable: true,
      },
      {
        table: 'qms_inspection_requests',
        nameColumn: 'processName',
        idColumn: 'processId',
        nullable: false,
      },
      {
        table: 'inspection_form_templates',
        nameColumn: 'processName',
        idColumn: 'processId',
        nullable: false,
      },
    ],
  },
  {
    key: 'team',
    rolloutWave: 1,
    writeStrategy: 'dual-write',
    readStrategy: 'canonical-first',
    backfillPolicy: 'canonical-id',
    auditPolicy: 'canonical-id-and-orphan',
    source: {
      type: 'dictionary',
      dictType: 'team',
    },
    canonical: {
      table: 'dictionaries',
      idColumn: 'id',
      nameColumn: 'dictKey',
      activeWhere: "isDeleted = 0 AND status = 1 AND dictType = 'team'",
    },
    targets: [
      {
        table: 'inspections',
        nameColumn: 'team',
        idColumn: 'teamId',
        nullable: true,
      },
      {
        table: 'qms_inspection_requests',
        nameColumn: 'team',
        idColumn: 'teamId',
        nullable: true,
      },
      {
        table: 'welders',
        nameColumn: 'team',
        idColumn: 'teamId',
        nullable: false,
      },
    ],
  },
  {
    key: 'defectType',
    rolloutWave: 1,
    writeStrategy: 'dual-write',
    readStrategy: 'canonical-first',
    backfillPolicy: 'canonical-id',
    auditPolicy: 'canonical-id-and-orphan',
    source: {
      type: 'dictionary',
      dictType: 'defect_type',
    },
    canonical: {
      table: 'dictionaries',
      idColumn: 'id',
      nameColumn: 'dictKey',
      activeWhere: "isDeleted = 0 AND status = 1 AND dictType = 'defect_type'",
    },
    targets: [
      {
        table: 'quality_records',
        nameColumn: 'defectType',
        idColumn: 'defectTypeId',
        nullable: true,
      },
      {
        table: 'after_sales',
        nameColumn: 'defectType',
        idColumn: 'defectTypeId',
        nullable: true,
      },
    ],
  },
  {
    key: 'defectSubtype',
    rolloutWave: 1,
    writeStrategy: 'dual-write',
    readStrategy: 'canonical-first',
    backfillPolicy: 'canonical-id',
    auditPolicy: 'canonical-id-and-orphan',
    source: {
      type: 'dictionary',
      dictType: 'defect_subtype',
    },
    canonical: {
      table: 'dictionaries',
      idColumn: 'id',
      nameColumn: 'dictKey',
      activeWhere:
        "isDeleted = 0 AND status = 1 AND dictType = 'defect_subtype'",
    },
    targets: [
      {
        table: 'quality_records',
        nameColumn: 'defectSubtype',
        idColumn: 'defectSubtypeId',
        nullable: true,
      },
      {
        table: 'after_sales',
        nameColumn: 'defectSubtype',
        idColumn: 'defectSubtypeId',
        nullable: true,
      },
    ],
  },
  {
    key: 'division',
    rolloutWave: 1,
    writeStrategy: 'dual-write',
    readStrategy: 'canonical-first',
    backfillPolicy: 'canonical-id',
    auditPolicy: 'canonical-id-and-orphan',
    source: {
      type: 'dictionary',
      dictType: 'division',
    },
    canonical: {
      table: 'dictionaries',
      idColumn: 'id',
      nameColumn: 'dictKey',
      activeWhere: "isDeleted = 0 AND status = 1 AND dictType = 'division'",
    },
    targets: [
      {
        table: 'quality_records',
        nameColumn: 'division',
        idColumn: 'divisionId',
        nullable: true,
      },
      {
        table: 'after_sales',
        nameColumn: 'division',
        idColumn: 'divisionId',
        nullable: true,
      },
      {
        table: 'work_orders',
        nameColumn: 'division',
        idColumn: 'divisionId',
        nullable: true,
      },
    ],
  },
  {
    key: 'customerName',
    rolloutWave: 1,
    writeStrategy: 'dual-write',
    readStrategy: 'canonical-first',
    backfillPolicy: 'canonical-id',
    auditPolicy: 'canonical-id-and-orphan',
    source: {
      type: 'dictionary',
      dictType: 'customer_name',
    },
    canonical: {
      table: 'dictionaries',
      idColumn: 'id',
      nameColumn: 'dictKey',
      activeWhere:
        "isDeleted = 0 AND status = 1 AND dictType = 'customer_name'",
    },
    targets: [
      {
        table: 'work_orders',
        nameColumn: 'customerName',
        idColumn: 'customerNameId',
        nullable: false,
      },
      {
        table: 'after_sales',
        nameColumn: 'customerName',
        idColumn: 'customerNameId',
        nullable: true,
      },
      {
        table: 'quality_plans',
        nameColumn: 'customer',
        idColumn: 'customerId',
        nullable: false,
      },
    ],
  },
  {
    key: 'productType',
    rolloutWave: 1,
    writeStrategy: 'dual-write',
    readStrategy: 'canonical-first',
    backfillPolicy: 'canonical-id',
    auditPolicy: 'canonical-id-and-orphan',
    source: {
      type: 'dictionary',
      dictType: 'product_type',
    },
    canonical: {
      table: 'dictionaries',
      idColumn: 'id',
      nameColumn: 'dictKey',
      activeWhere: "isDeleted = 0 AND status = 1 AND dictType = 'product_type'",
    },
    targets: [
      {
        table: 'after_sales',
        nameColumn: 'productType',
        idColumn: 'productTypeId',
        nullable: true,
      },
    ],
  },
  {
    key: 'productSubtype',
    rolloutWave: 1,
    writeStrategy: 'dual-write',
    readStrategy: 'canonical-first',
    backfillPolicy: 'canonical-id',
    auditPolicy: 'canonical-id-and-orphan',
    source: {
      type: 'dictionary',
      dictType: 'product_subtype',
    },
    canonical: {
      table: 'dictionaries',
      idColumn: 'id',
      nameColumn: 'dictKey',
      activeWhere:
        "isDeleted = 0 AND status = 1 AND dictType = 'product_subtype'",
    },
    targets: [
      {
        table: 'after_sales',
        nameColumn: 'productSubtype',
        idColumn: 'productSubtypeId',
        nullable: true,
      },
    ],
  },
  {
    key: 'failureType',
    rolloutWave: 1,
    writeStrategy: 'dual-write',
    readStrategy: 'canonical-first',
    backfillPolicy: 'canonical-id',
    auditPolicy: 'canonical-id-and-orphan',
    source: {
      type: 'dictionary',
      dictType: 'failure_type',
    },
    canonical: {
      table: 'dictionaries',
      idColumn: 'id',
      nameColumn: 'dictKey',
      activeWhere: "isDeleted = 0 AND status = 1 AND dictType = 'failure_type'",
    },
    targets: [
      {
        table: 'after_sales',
        nameColumn: 'failureType',
        idColumn: 'failureTypeId',
        nullable: true,
      },
    ],
  },
  {
    key: 'failureCause',
    rolloutWave: 1,
    writeStrategy: 'dual-write',
    readStrategy: 'canonical-first',
    backfillPolicy: 'canonical-id',
    auditPolicy: 'canonical-id-and-orphan',
    source: {
      type: 'dictionary',
      dictType: 'failure_cause',
    },
    canonical: {
      table: 'dictionaries',
      idColumn: 'id',
      nameColumn: 'dictKey',
      activeWhere:
        "isDeleted = 0 AND status = 1 AND dictType = 'failure_cause'",
    },
    targets: [
      {
        table: 'after_sales',
        nameColumn: 'failureCause',
        idColumn: 'failureCauseId',
        nullable: true,
      },
    ],
  },
  {
    key: 'supplierBrand',
    rolloutWave: 2,
    writeStrategy: 'dual-write',
    readStrategy: 'canonical-first',
    backfillPolicy: 'canonical-id',
    auditPolicy: 'canonical-id-and-orphan',
    source: {
      type: 'dictionary',
      dictType: 'supplier_brand',
    },
    canonical: {
      table: 'dictionaries',
      idColumn: 'id',
      nameColumn: 'dictKey',
      activeWhere:
        "isDeleted = 0 AND status = 1 AND dictType = 'supplier_brand'",
    },
    targets: [
      {
        table: 'after_sales',
        nameColumn: 'supplierBrand',
        idColumn: 'supplierBrandId',
        nullable: true,
      },
    ],
  },
  {
    key: 'qualityLossType',
    rolloutWave: 2,
    writeStrategy: 'dual-write',
    readStrategy: 'canonical-first',
    backfillPolicy: 'canonical-id',
    auditPolicy: 'canonical-id-and-orphan',
    source: {
      type: 'dictionary',
      dictType: 'quality_loss_type',
    },
    canonical: {
      table: 'dictionaries',
      idColumn: 'id',
      nameColumn: 'dictKey',
      activeWhere:
        "isDeleted = 0 AND status = 1 AND dictType = 'quality_loss_type'",
    },
    targets: [
      {
        table: 'quality_losses',
        nameColumn: 'type',
        idColumn: 'typeId',
        nullable: false,
      },
    ],
  },
  {
    key: 'incomingType',
    rolloutWave: 7,
    writeStrategy: 'dual-write',
    readStrategy: 'canonical-first',
    backfillPolicy: 'canonical-id',
    auditPolicy: 'canonical-id-and-orphan',
    source: {
      type: 'dictionary',
      dictType: 'incoming_type',
    },
    canonical: {
      table: 'dictionaries',
      idColumn: 'id',
      nameColumn: 'dictKey',
      activeWhere:
        "isDeleted = 0 AND status = 1 AND dictType = 'incoming_type'",
    },
    targets: [
      {
        table: 'inspections',
        nameColumn: 'incomingType',
        idColumn: 'incomingTypeId',
        nullable: true,
      },
    ],
  },
  {
    key: 'materialName',
    rolloutWave: 7,
    writeStrategy: 'dual-write',
    readStrategy: 'canonical-first',
    backfillPolicy: 'canonical-id',
    auditPolicy: 'canonical-id-and-orphan',
    source: {
      type: 'dictionary',
      dictType: 'material_name',
    },
    canonical: {
      table: 'dictionaries',
      idColumn: 'id',
      nameColumn: 'dictKey',
      activeWhere:
        "isDeleted = 0 AND status = 1 AND dictType = 'material_name'",
    },
    targets: [
      {
        table: 'inspections',
        nameColumn: 'materialName',
        idColumn: 'materialNameId',
        nullable: true,
      },
    ],
  },
  {
    key: 'componentName',
    rolloutWave: 7,
    writeStrategy: 'dual-write',
    readStrategy: 'canonical-first',
    backfillPolicy: 'canonical-id',
    auditPolicy: 'canonical-id-and-orphan',
    source: {
      type: 'dictionary',
      dictType: 'component_name',
    },
    canonical: {
      table: 'dictionaries',
      idColumn: 'id',
      nameColumn: 'dictKey',
      activeWhere:
        "isDeleted = 0 AND status = 1 AND dictType = 'component_name'",
    },
    targets: [
      {
        table: 'qms_inspection_requests',
        nameColumn: 'componentName',
        idColumn: 'componentId',
        nullable: true,
      },
    ],
  },
  {
    key: 'requirementName',
    rolloutWave: 7,
    writeStrategy: 'dual-write',
    readStrategy: 'canonical-first',
    backfillPolicy: 'canonical-id',
    auditPolicy: 'canonical-id-and-orphan',
    source: {
      type: 'dictionary',
      dictType: 'requirement_name',
    },
    canonical: {
      table: 'dictionaries',
      idColumn: 'id',
      nameColumn: 'dictKey',
      activeWhere:
        "isDeleted = 0 AND status = 1 AND dictType = 'requirement_name'",
    },
    targets: [
      {
        table: 'work_order_requirements',
        nameColumn: 'requirementName',
        idColumn: 'requirementId',
        nullable: false,
      },
    ],
  },
  {
    key: 'responsibleTeam',
    rolloutWave: 2,
    writeStrategy: 'dual-write',
    readStrategy: 'canonical-first',
    backfillPolicy: 'canonical-id',
    auditPolicy: 'canonical-id-and-orphan',
    source: {
      type: 'dictionary',
      dictType: 'team',
    },
    canonical: {
      table: 'dictionaries',
      idColumn: 'id',
      nameColumn: 'dictKey',
      activeWhere: "isDeleted = 0 AND status = 1 AND dictType = 'team'",
    },
    targets: [
      {
        table: 'work_order_requirements',
        nameColumn: 'responsibleTeam',
        idColumn: 'responsibleTeamId',
        nullable: true,
      },
    ],
  },
  {
    key: 'borrowerName',
    rolloutWave: 2,
    writeStrategy: 'dual-write',
    readStrategy: 'canonical-first',
    backfillPolicy: 'canonical-id',
    auditPolicy: 'canonical-id-and-orphan',
    source: {
      type: 'dictionary',
      dictType: 'borrower_name',
    },
    canonical: {
      table: 'dictionaries',
      idColumn: 'id',
      nameColumn: 'dictKey',
      activeWhere:
        "isDeleted = 0 AND status = 1 AND dictType = 'borrower_name'",
    },
    targets: [
      {
        table: 'metrology_borrow_records',
        nameColumn: 'borrowerName',
        idColumn: 'borrowerNameId',
        nullable: false,
      },
    ],
  },
  {
    key: 'supplierEntityName',
    rolloutWave: 2,
    writeStrategy: 'dual-write',
    readStrategy: 'canonical-first',
    backfillPolicy: 'canonical-id',
    auditPolicy: 'canonical-id-and-orphan',
    source: {
      type: 'dictionary',
      dictType: 'supplier_entity_name',
    },
    canonical: {
      table: 'dictionaries',
      idColumn: 'id',
      nameColumn: 'dictKey',
      activeWhere:
        "isDeleted = 0 AND status = 1 AND dictType = 'supplier_entity_name'",
    },
    targets: [
      {
        table: 'suppliers',
        nameColumn: 'name',
        idColumn: 'nameId',
        nullable: false,
      },
    ],
  },
  {
    key: 'supplierProductName',
    rolloutWave: 2,
    writeStrategy: 'dual-write',
    readStrategy: 'canonical-first',
    backfillPolicy: 'canonical-id',
    auditPolicy: 'canonical-id-and-orphan',
    source: {
      type: 'dictionary',
      dictType: 'supplier_product_name',
    },
    canonical: {
      table: 'dictionaries',
      idColumn: 'id',
      nameColumn: 'dictKey',
      activeWhere:
        "isDeleted = 0 AND status = 1 AND dictType = 'supplier_product_name'",
    },
    targets: [
      {
        table: 'suppliers',
        nameColumn: 'productName',
        idColumn: 'productNameId',
        nullable: true,
      },
    ],
  },
  {
    key: 'supplierProject',
    rolloutWave: 2,
    writeStrategy: 'dual-write',
    readStrategy: 'canonical-first',
    backfillPolicy: 'canonical-id',
    auditPolicy: 'canonical-id-and-orphan',
    source: {
      type: 'dictionary',
      dictType: 'supplier_project',
    },
    canonical: {
      table: 'dictionaries',
      idColumn: 'id',
      nameColumn: 'dictKey',
      activeWhere:
        "isDeleted = 0 AND status = 1 AND dictType = 'supplier_project'",
    },
    targets: [
      {
        table: 'suppliers',
        nameColumn: 'project',
        idColumn: 'projectId',
        nullable: true,
      },
    ],
  },
  {
    key: 'rootCause',
    rolloutWave: 2,
    writeStrategy: 'dual-write',
    readStrategy: 'canonical-first',
    backfillPolicy: 'canonical-id',
    auditPolicy: 'canonical-id-and-orphan',
    source: {
      type: 'dictionary',
      dictType: 'root_cause',
    },
    canonical: {
      table: 'dictionaries',
      idColumn: 'id',
      nameColumn: 'dictKey',
      activeWhere: "isDeleted = 0 AND status = 1 AND dictType = 'root_cause'",
    },
    targets: [
      {
        table: 'quality_records',
        nameColumn: 'rootCause',
        idColumn: 'rootCauseId',
        nullable: true,
      },
    ],
  },
  {
    key: 'qualityRecordCategory',
    rolloutWave: 2,
    writeStrategy: 'dual-write',
    readStrategy: 'canonical-first',
    backfillPolicy: 'canonical-id',
    auditPolicy: 'canonical-id-and-orphan',
    source: {
      type: 'dictionary',
      dictType: 'quality_record_category',
    },
    canonical: {
      table: 'dictionaries',
      idColumn: 'id',
      nameColumn: 'dictKey',
      activeWhere:
        "isDeleted = 0 AND status = 1 AND dictType = 'quality_record_category'",
    },
    targets: [
      {
        table: 'quality_records',
        nameColumn: 'category',
        idColumn: 'categoryId',
        nullable: true,
      },
    ],
  },
  {
    key: 'supplierCategory',
    rolloutWave: 2,
    writeStrategy: 'dual-write',
    readStrategy: 'canonical-first',
    backfillPolicy: 'canonical-id',
    auditPolicy: 'canonical-id-and-orphan',
    source: {
      type: 'dictionary',
      dictType: 'supplier_category',
    },
    canonical: {
      table: 'dictionaries',
      idColumn: 'id',
      nameColumn: 'dictKey',
      activeWhere:
        "isDeleted = 0 AND status = 1 AND dictType = 'supplier_category'",
    },
    targets: [
      {
        table: 'suppliers',
        nameColumn: 'category',
        idColumn: 'categoryId',
        nullable: false,
      },
    ],
  },
  {
    key: 'taskDispatchType',
    rolloutWave: 2,
    writeStrategy: 'dual-write',
    readStrategy: 'canonical-first',
    backfillPolicy: 'canonical-id',
    auditPolicy: 'canonical-id-and-orphan',
    source: {
      type: 'dictionary',
      dictType: 'task_dispatch_type',
    },
    canonical: {
      table: 'dictionaries',
      idColumn: 'id',
      nameColumn: 'dictKey',
      activeWhere:
        "isDeleted = 0 AND status = 1 AND dictType = 'task_dispatch_type'",
    },
    targets: [
      {
        table: 'qms_task_dispatches',
        nameColumn: 'type',
        idColumn: 'typeId',
        nullable: false,
      },
    ],
  },
  {
    key: 'supplierName',
    rolloutWave: 2,
    writeStrategy: 'dual-write',
    readStrategy: 'canonical-first',
    backfillPolicy: 'canonical-id',
    auditPolicy: 'canonical-id-and-orphan',
    source: {
      type: 'table',
      table: 'suppliers',
      valueColumn: 'name',
      where: 'isDeleted = 0',
    },
    canonical: {
      table: 'suppliers',
      idColumn: 'id',
      nameColumn: 'name',
      activeWhere: 'isDeleted = 0',
    },
    targets: [
      {
        table: 'inspections',
        nameColumn: 'supplierName',
        idColumn: 'supplierId',
        nullable: true,
      },
      {
        table: 'quality_records',
        nameColumn: 'supplierName',
        idColumn: 'supplierId',
        nullable: true,
      },
      {
        table: 'supervision_projects',
        nameColumn: 'supplierName',
        idColumn: 'supplierId',
        nullable: true,
      },
    ],
  },
  {
    key: 'responsibleDepartment',
    rolloutWave: 2,
    writeStrategy: 'dual-write',
    readStrategy: 'canonical-first',
    backfillPolicy: 'canonical-id',
    auditPolicy: 'canonical-id-and-orphan',
    source: {
      type: 'table',
      table: 'departments',
      valueColumn: 'name',
      where: 'isDeleted = 0',
    },
    canonical: {
      table: 'departments',
      idColumn: 'id',
      nameColumn: 'name',
      activeWhere: 'isDeleted = 0',
    },
    targets: [
      {
        table: 'quality_records',
        nameColumn: 'responsibleDepartment',
        idColumn: 'responsibleDepartmentId',
        nullable: false,
      },
      {
        table: 'vehicle_commissioning_issues',
        nameColumn: 'responsibleDepartment',
        idColumn: 'responsibleDepartmentId',
        nullable: true,
      },
      {
        table: 'after_sales',
        nameColumn: 'respDept',
        idColumn: 'respDeptId',
        nullable: true,
      },
      {
        table: 'after_sales',
        nameColumn: 'feedbackDept',
        idColumn: 'feedbackDeptId',
        nullable: true,
      },
      {
        table: 'quality_losses',
        nameColumn: 'respDept',
        idColumn: 'respDeptId',
        nullable: true,
      },
      {
        table: 'metrology_borrow_records',
        nameColumn: 'borrowerDepartment',
        idColumn: 'borrowerDepartmentId',
        nullable: false,
      },
    ],
  },
  {
    key: 'projectName',
    rolloutWave: 3,
    requiresDerivedRuleFreeze: true,
    writeStrategy: 'dual-write',
    readStrategy: 'canonical-first',
    backfillPolicy: 'canonical-id',
    auditPolicy: 'canonical-id-and-orphan',
    source: {
      type: 'derived',
      description: 'Derived from work order master project names',
      valueSql: `SELECT DISTINCT value FROM (
           SELECT projectName AS value
           FROM work_orders
           WHERE isDeleted = 0 AND projectName IS NOT NULL AND TRIM(projectName) <> ''
           UNION
           SELECT projectName AS value
           FROM inspections
           WHERE isDeleted = 0 AND projectName IS NOT NULL AND TRIM(projectName) <> ''
           UNION
           SELECT projectName AS value
           FROM quality_records
           WHERE isDeleted = 0 AND projectName IS NOT NULL AND TRIM(projectName) <> ''
           UNION
           SELECT projectName AS value
           FROM supervision_projects
           WHERE isDeleted = 0 AND projectName IS NOT NULL AND TRIM(projectName) <> ''
         ) t`,
    },
    canonical: {
      table: 'master_projects',
      idColumn: 'id',
      nameColumn: 'name',
      activeWhere: 'isDeleted = 0',
    },
    targets: [
      {
        table: 'inspections',
        nameColumn: 'projectName',
        idColumn: 'projectId',
        nullable: true,
      },
      {
        table: 'quality_records',
        nameColumn: 'projectName',
        idColumn: 'projectId',
        nullable: true,
      },
      {
        table: 'work_orders',
        nameColumn: 'projectName',
        idColumn: 'projectId',
        nullable: true,
      },
      {
        table: 'quality_plans',
        nameColumn: 'projectName',
        idColumn: 'projectId',
        nullable: false,
      },
      {
        table: 'vehicle_commissioning_issues',
        nameColumn: 'projectName',
        idColumn: 'projectId',
        nullable: true,
      },
      {
        table: 'supervision_projects',
        nameColumn: 'projectName',
        idColumn: 'projectId',
        nullable: false,
      },
      {
        table: 'after_sales',
        nameColumn: 'projectName',
        idColumn: 'projectId',
        nullable: false,
      },
      {
        table: 'inspection_form_templates',
        nameColumn: 'projectName',
        idColumn: 'projectId',
        nullable: true,
      },
      {
        table: 'inspection_archive_tasks',
        nameColumn: 'projectName',
        idColumn: 'projectId',
        nullable: true,
      },
      {
        table: 'bom_projects',
        nameColumn: 'projectName',
        idColumn: 'projectId',
        nullable: false,
      },
      {
        table: 'doc_projects',
        nameColumn: 'projectName',
        idColumn: 'projectId',
        nullable: false,
      },
      {
        table: 'dfmea_projects',
        nameColumn: 'projectName',
        idColumn: 'projectId',
        nullable: false,
      },
    ],
  },
  {
    key: 'dfmeaCause',
    rolloutWave: 2,
    writeStrategy: 'dual-write',
    readStrategy: 'canonical-first',
    backfillPolicy: 'canonical-id',
    auditPolicy: 'canonical-id-and-orphan',
    source: {
      type: 'dictionary',
      dictType: 'dfmea_cause',
    },
    canonical: {
      table: 'dictionaries',
      idColumn: 'id',
      nameColumn: 'dictKey',
      activeWhere: "isDeleted = 0 AND status = 1 AND dictType = 'dfmea_cause'",
    },
    targets: [
      {
        table: 'dfmea',
        nameColumn: 'cause',
        idColumn: 'causeId',
        nullable: true,
      },
    ],
  },
  {
    key: 'inspectionFormName',
    rolloutWave: 2,
    writeStrategy: 'dual-write',
    readStrategy: 'canonical-first',
    backfillPolicy: 'canonical-id',
    auditPolicy: 'canonical-id-and-orphan',
    source: {
      type: 'dictionary',
      dictType: 'inspection_form_name',
    },
    canonical: {
      table: 'dictionaries',
      idColumn: 'id',
      nameColumn: 'dictKey',
      activeWhere:
        "isDeleted = 0 AND status = 1 AND dictType = 'inspection_form_name'",
    },
    targets: [
      {
        table: 'inspection_form_templates',
        nameColumn: 'formName',
        idColumn: 'formNameId',
        nullable: false,
      },
    ],
  },
  {
    key: 'itpProcessStep',
    rolloutWave: 2,
    writeStrategy: 'dual-write',
    readStrategy: 'canonical-first',
    backfillPolicy: 'canonical-id',
    auditPolicy: 'canonical-id-and-orphan',
    source: {
      type: 'dictionary',
      dictType: 'itp_process_step',
    },
    canonical: {
      table: 'dictionaries',
      idColumn: 'id',
      nameColumn: 'dictKey',
      activeWhere:
        "isDeleted = 0 AND status = 1 AND dictType = 'itp_process_step'",
    },
    targets: [
      {
        table: 'itp_items',
        nameColumn: 'processStep',
        idColumn: 'processStepId',
        nullable: false,
      },
    ],
  },
  {
    key: 'instrumentName',
    rolloutWave: 2,
    writeStrategy: 'dual-write',
    readStrategy: 'canonical-first',
    backfillPolicy: 'canonical-id',
    auditPolicy: 'canonical-id-and-orphan',
    source: {
      type: 'dictionary',
      dictType: 'instrument_name',
    },
    canonical: {
      table: 'dictionaries',
      idColumn: 'id',
      nameColumn: 'dictKey',
      activeWhere:
        "isDeleted = 0 AND status = 1 AND dictType = 'instrument_name'",
    },
    targets: [
      {
        table: 'measuring_instruments',
        nameColumn: 'instrumentName',
        idColumn: 'instrumentNameId',
        nullable: false,
      },
    ],
  },
  {
    key: 'supervisionIssueType',
    rolloutWave: 2,
    writeStrategy: 'dual-write',
    readStrategy: 'canonical-first',
    backfillPolicy: 'canonical-id',
    auditPolicy: 'canonical-id-and-orphan',
    source: {
      type: 'dictionary',
      dictType: 'supervision_issue_type',
    },
    canonical: {
      table: 'dictionaries',
      idColumn: 'id',
      nameColumn: 'dictKey',
      activeWhere:
        "isDeleted = 0 AND status = 1 AND dictType = 'supervision_issue_type'",
    },
    targets: [
      {
        table: 'supervision_issues',
        nameColumn: 'issueType',
        idColumn: 'issueTypeId',
        nullable: false,
      },
    ],
  },
  {
    key: 'supervisionIssueActionType',
    rolloutWave: 2,
    writeStrategy: 'dual-write',
    readStrategy: 'canonical-first',
    backfillPolicy: 'canonical-id',
    auditPolicy: 'canonical-id-and-orphan',
    source: {
      type: 'dictionary',
      dictType: 'supervision_issue_action_type',
    },
    canonical: {
      table: 'dictionaries',
      idColumn: 'id',
      nameColumn: 'dictKey',
      activeWhere:
        "isDeleted = 0 AND status = 1 AND dictType = 'supervision_issue_action_type'",
    },
    targets: [
      {
        table: 'supervision_issue_actions',
        nameColumn: 'actionType',
        idColumn: 'actionTypeId',
        nullable: false,
      },
    ],
  },
  {
    key: 'supervisionProjectType',
    rolloutWave: 2,
    writeStrategy: 'dual-write',
    readStrategy: 'canonical-first',
    backfillPolicy: 'canonical-id',
    auditPolicy: 'canonical-id-and-orphan',
    source: {
      type: 'dictionary',
      dictType: 'supervision_project_type',
    },
    canonical: {
      table: 'dictionaries',
      idColumn: 'id',
      nameColumn: 'dictKey',
      activeWhere:
        "isDeleted = 0 AND status = 1 AND dictType = 'supervision_project_type'",
    },
    targets: [
      {
        table: 'supervision_projects',
        nameColumn: 'projectType',
        idColumn: 'projectTypeId',
        nullable: false,
      },
    ],
  },
  {
    key: 'standardDocumentCategory',
    rolloutWave: 2,
    writeStrategy: 'dual-write',
    readStrategy: 'canonical-first',
    backfillPolicy: 'canonical-id',
    auditPolicy: 'canonical-id-and-orphan',
    source: {
      type: 'dictionary',
      dictType: 'standard_document_category',
    },
    canonical: {
      table: 'dictionaries',
      idColumn: 'id',
      nameColumn: 'dictKey',
      activeWhere:
        "isDeleted = 0 AND status = 1 AND dictType = 'standard_document_category'",
    },
    targets: [
      {
        table: 'standard_documents',
        nameColumn: 'category',
        idColumn: 'categoryId',
        nullable: false,
      },
    ],
  },
  {
    key: 'bomPartNumber',
    rolloutWave: 3,
    writeStrategy: 'name-only',
    readStrategy: 'name-only',
    backfillPolicy: 'none',
    auditPolicy: 'orphan-only',
    source: {
      type: 'table',
      table: 'project_boms',
      valueColumn: 'part_number',
    },
    targets: [
      { table: 'project_boms', nameColumn: 'part_number', nullable: true },
    ],
  },
  {
    key: 'bomRequiredProcesses',
    rolloutWave: 3,
    writeStrategy: 'name-only',
    readStrategy: 'name-only',
    backfillPolicy: 'none',
    auditPolicy: 'orphan-only',
    source: {
      type: 'table',
      table: 'project_boms',
      valueColumn: 'required_processes',
    },
    targets: [
      {
        table: 'project_boms',
        nameColumn: 'required_processes',
        nullable: true,
      },
    ],
  },
  {
    key: 'partName',
    rolloutWave: 3,
    requiresDerivedRuleFreeze: true,
    writeStrategy: 'dual-write',
    readStrategy: 'canonical-first',
    backfillPolicy: 'canonical-id',
    auditPolicy: 'canonical-id-and-orphan',
    source: {
      type: 'derived',
      description:
        'Derived from active quality records and inspection requests',
      valueSql: `SELECT DISTINCT value FROM (
           SELECT partName AS value
           FROM quality_records
           WHERE isDeleted = 0 AND partName IS NOT NULL AND TRIM(partName) <> ''
           UNION
           SELECT partName AS value
           FROM qms_inspection_requests
           WHERE isDeleted = 0 AND partName IS NOT NULL AND TRIM(partName) <> ''
           UNION
           SELECT partName AS value
           FROM work_order_requirements
           WHERE isDeleted = 0 AND partName IS NOT NULL AND TRIM(partName) <> ''
           UNION
           SELECT partName AS value
           FROM vehicle_commissioning_issues
           WHERE isDeleted = 0 AND partName IS NOT NULL AND TRIM(partName) <> ''
           UNION
           SELECT partName AS value
           FROM after_sales
           WHERE isDeleted = 0 AND partName IS NOT NULL AND TRIM(partName) <> ''
           UNION
           SELECT part_name AS value
           FROM project_boms
           WHERE part_name IS NOT NULL AND TRIM(part_name) <> ''
         ) t`,
    },
    canonical: {
      table: 'master_parts',
      idColumn: 'id',
      nameColumn: 'name',
      activeWhere: 'isDeleted = 0',
    },
    targets: [
      {
        table: 'quality_records',
        nameColumn: 'partName',
        idColumn: 'partId',
        nullable: false,
      },
      {
        table: 'qms_inspection_requests',
        nameColumn: 'partName',
        idColumn: 'partId',
        nullable: false,
      },
      {
        table: 'work_order_requirements',
        nameColumn: 'partName',
        idColumn: 'partId',
        nullable: true,
      },
      {
        table: 'inspection_form_templates',
        nameColumn: 'partName',
        idColumn: 'partId',
        nullable: true,
      },
      {
        table: 'vehicle_commissioning_issues',
        nameColumn: 'partName',
        idColumn: 'partId',
        nullable: true,
      },
      {
        table: 'after_sales',
        nameColumn: 'partName',
        idColumn: 'partId',
        nullable: true,
      },
      {
        table: 'project_boms',
        nameColumn: 'part_name',
        idColumn: 'partId',
        nullable: false,
      },
    ],
  },
  {
    key: 'weldersName',
    rolloutWave: 8,
    writeStrategy: 'name-only',
    readStrategy: 'name-only',
    backfillPolicy: 'none',
    auditPolicy: 'orphan-only',
    source: {
      type: 'table',
      table: 'welders',
      valueColumn: 'name',
      where: 'isDeleted = 0',
    },
    targets: [{ table: 'welders', nameColumn: 'name', nullable: false }],
  },
  {
    key: 'rolesName',
    rolloutWave: 8,
    writeStrategy: 'name-only',
    readStrategy: 'name-only',
    backfillPolicy: 'none',
    auditPolicy: 'orphan-only',
    source: {
      type: 'table',
      table: 'roles',
      valueColumn: 'name',
      where: 'isDeleted = 0',
    },
    targets: [{ table: 'roles', nameColumn: 'name', nullable: false }],
  },
  {
    key: 'sequencesName',
    rolloutWave: 8,
    writeStrategy: 'name-only',
    readStrategy: 'name-only',
    backfillPolicy: 'none',
    auditPolicy: 'orphan-only',
    source: {
      type: 'table',
      table: 'sequences',
      valueColumn: 'name',
    },
    targets: [{ table: 'sequences', nameColumn: 'name', nullable: false }],
  },
  {
    key: 'standardDocumentName',
    rolloutWave: 8,
    writeStrategy: 'name-only',
    readStrategy: 'name-only',
    backfillPolicy: 'none',
    auditPolicy: 'orphan-only',
    source: {
      type: 'table',
      table: 'standard_documents',
      valueColumn: 'name',
      where: 'isDeleted = 0',
    },
    targets: [
      { table: 'standard_documents', nameColumn: 'name', nullable: false },
    ],
  },
  {
    key: 'userUsername',
    rolloutWave: 8,
    writeStrategy: 'name-only',
    readStrategy: 'name-only',
    backfillPolicy: 'none',
    auditPolicy: 'orphan-only',
    source: {
      type: 'table',
      table: 'users',
      valueColumn: 'username',
      where: 'isDeleted = 0',
    },
    targets: [{ table: 'users', nameColumn: 'username', nullable: false }],
  },
  {
    key: 'userRealName',
    rolloutWave: 8,
    writeStrategy: 'name-only',
    readStrategy: 'name-only',
    backfillPolicy: 'none',
    auditPolicy: 'orphan-only',
    source: {
      type: 'table',
      table: 'users',
      valueColumn: 'realName',
      where: 'isDeleted = 0',
    },
    targets: [{ table: 'users', nameColumn: 'realName', nullable: false }],
  },
  {
    key: 'userDepartment',
    rolloutWave: 8,
    writeStrategy: 'name-only',
    readStrategy: 'name-only',
    backfillPolicy: 'none',
    auditPolicy: 'orphan-only',
    source: {
      type: 'table',
      table: 'users',
      valueColumn: 'department',
      where: 'isDeleted = 0',
    },
    targets: [{ table: 'users', nameColumn: 'department', nullable: false }],
  },
  {
    key: 'knowledgeCategoryName',
    rolloutWave: 8,
    writeStrategy: 'name-only',
    readStrategy: 'name-only',
    backfillPolicy: 'none',
    auditPolicy: 'orphan-only',
    source: {
      type: 'table',
      table: 'knowledge_categories',
      valueColumn: 'name',
      where: 'isDeleted = 0',
    },
    targets: [
      { table: 'knowledge_categories', nameColumn: 'name', nullable: false },
    ],
  },
];

const MASTER_DATA_FIELD_MAP = new Map(
  MASTER_DATA_FIELDS.map((item) => [item.key, item] as const),
);

export function listMasterDataGovernanceFields() {
  return MASTER_DATA_FIELDS;
}

export function listMasterDataGovernanceFieldsByWave(wave: number) {
  return MASTER_DATA_FIELDS.filter((field) => field.rolloutWave === wave);
}

export function listMasterDataGovernanceWaves() {
  return [...new Set(MASTER_DATA_FIELDS.map((field) => field.rolloutWave))]
    .filter((wave) => Number.isFinite(wave))
    .sort((a, b) => a - b);
}

export function getMasterDataGovernanceField(configKey: string) {
  return MASTER_DATA_FIELD_MAP.get(String(configKey || '').trim());
}

export function getMasterDataGovernanceFieldKeys() {
  return MASTER_DATA_FIELDS.map((field) => field.key);
}
