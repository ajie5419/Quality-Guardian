import { randomUUID } from 'node:crypto';
import process from 'node:process';

import prisma from '../utils/prisma';

type ValueRow = { value: null | string };

interface SeedConfig {
  dictType:
    | 'borrower_name'
    | 'component_name'
    | 'customer_name'
    | 'defect_subtype'
    | 'defect_type'
    | 'dfmea_cause'
    | 'division'
    | 'failure_cause'
    | 'failure_type'
    | 'incoming_type'
    | 'inspection_form_name'
    | 'instrument_name'
    | 'itp_process_step'
    | 'material_name'
    | 'product_subtype'
    | 'product_type'
    | 'quality_loss_type'
    | 'quality_record_category'
    | 'requirement_name'
    | 'root_cause'
    | 'standard_document_category'
    | 'supervision_issue_action_type'
    | 'supervision_issue_type'
    | 'supervision_project_type'
    | 'supplier_brand'
    | 'supplier_category'
    | 'supplier_entity_name'
    | 'supplier_product_name'
    | 'supplier_project'
    | 'task_dispatch_type'
    | 'team';
  queries: string[];
}

const SEED_CONFIGS: SeedConfig[] = [
  {
    dictType: 'defect_type',
    queries: [
      `SELECT DISTINCT defectType AS value
       FROM quality_records
       WHERE defectType IS NOT NULL AND TRIM(defectType) <> ''`,
      `SELECT DISTINCT defectType AS value
       FROM after_sales
       WHERE defectType IS NOT NULL AND TRIM(defectType) <> ''`,
    ],
  },
  {
    dictType: 'defect_subtype',
    queries: [
      `SELECT DISTINCT defectSubtype AS value
       FROM quality_records
       WHERE defectSubtype IS NOT NULL AND TRIM(defectSubtype) <> ''`,
      `SELECT DISTINCT defectSubtype AS value
       FROM after_sales
       WHERE defectSubtype IS NOT NULL AND TRIM(defectSubtype) <> ''`,
    ],
  },
  {
    dictType: 'team',
    queries: [
      `SELECT DISTINCT team AS value
       FROM inspections
       WHERE team IS NOT NULL AND TRIM(team) <> ''`,
      `SELECT DISTINCT team AS value
       FROM qms_inspection_requests
       WHERE team IS NOT NULL AND TRIM(team) <> ''`,
      `SELECT DISTINCT team AS value
       FROM welders
       WHERE team IS NOT NULL AND TRIM(team) <> ''`,
    ],
  },
  {
    dictType: 'division',
    queries: [
      `SELECT DISTINCT division AS value
       FROM work_orders
       WHERE isDeleted = 0 AND division IS NOT NULL AND TRIM(division) <> ''`,
      `SELECT DISTINCT division AS value
       FROM quality_records
       WHERE isDeleted = 0 AND division IS NOT NULL AND TRIM(division) <> ''`,
      `SELECT DISTINCT division AS value
       FROM after_sales
       WHERE isDeleted = 0 AND division IS NOT NULL AND TRIM(division) <> ''`,
    ],
  },
  {
    dictType: 'customer_name',
    queries: [
      `SELECT DISTINCT customerName AS value
       FROM work_orders
       WHERE isDeleted = 0 AND customerName IS NOT NULL AND TRIM(customerName) <> ''`,
      `SELECT DISTINCT customerName AS value
       FROM after_sales
       WHERE isDeleted = 0 AND customerName IS NOT NULL AND TRIM(customerName) <> ''`,
      `SELECT DISTINCT customer AS value
       FROM quality_plans
       WHERE isDeleted = 0 AND customer IS NOT NULL AND TRIM(customer) <> ''`,
    ],
  },
  {
    dictType: 'product_type',
    queries: [
      `SELECT DISTINCT productType AS value
       FROM after_sales
       WHERE productType IS NOT NULL AND TRIM(productType) <> ''`,
    ],
  },
  {
    dictType: 'product_subtype',
    queries: [
      `SELECT DISTINCT productSubtype AS value
       FROM after_sales
       WHERE productSubtype IS NOT NULL AND TRIM(productSubtype) <> ''`,
    ],
  },
  {
    dictType: 'failure_type',
    queries: [
      `SELECT DISTINCT failureType AS value
       FROM after_sales
       WHERE failureType IS NOT NULL AND TRIM(failureType) <> ''`,
    ],
  },
  {
    dictType: 'failure_cause',
    queries: [
      `SELECT DISTINCT failureCause AS value
       FROM after_sales
       WHERE failureCause IS NOT NULL AND TRIM(failureCause) <> ''`,
    ],
  },
  {
    dictType: 'task_dispatch_type',
    queries: [
      `SELECT DISTINCT type AS value
       FROM qms_task_dispatches
       WHERE type IS NOT NULL AND TRIM(type) <> ''`,
    ],
  },
  {
    dictType: 'incoming_type',
    queries: [
      `SELECT DISTINCT incomingType AS value
       FROM inspections
       WHERE isDeleted = 0 AND incomingType IS NOT NULL AND TRIM(incomingType) <> ''`,
    ],
  },
  {
    dictType: 'material_name',
    queries: [
      `SELECT DISTINCT materialName AS value
       FROM inspections
       WHERE isDeleted = 0 AND materialName IS NOT NULL AND TRIM(materialName) <> ''`,
    ],
  },
  {
    dictType: 'component_name',
    queries: [
      `SELECT DISTINCT componentName AS value
       FROM qms_inspection_requests
       WHERE isDeleted = 0 AND componentName IS NOT NULL AND TRIM(componentName) <> ''`,
    ],
  },
  {
    dictType: 'requirement_name',
    queries: [
      `SELECT DISTINCT requirementName AS value
       FROM work_order_requirements
       WHERE isDeleted = 0 AND requirementName IS NOT NULL AND TRIM(requirementName) <> ''`,
    ],
  },
  {
    dictType: 'itp_process_step',
    queries: [
      `SELECT DISTINCT processStep AS value
       FROM itp_items
       WHERE isDeleted = 0 AND processStep IS NOT NULL AND TRIM(processStep) <> ''`,
    ],
  },
  {
    dictType: 'dfmea_cause',
    queries: [
      `SELECT DISTINCT cause AS value
       FROM dfmea
       WHERE isDeleted = 0 AND cause IS NOT NULL AND TRIM(cause) <> ''`,
    ],
  },
  {
    dictType: 'quality_record_category',
    queries: [
      `SELECT DISTINCT category AS value
       FROM quality_records
       WHERE isDeleted = 0 AND category IS NOT NULL AND TRIM(category) <> ''`,
    ],
  },
  {
    dictType: 'supplier_category',
    queries: [
      `SELECT DISTINCT category AS value
       FROM suppliers
       WHERE isDeleted = 0 AND category IS NOT NULL AND TRIM(category) <> ''`,
    ],
  },
  {
    dictType: 'supplier_entity_name',
    queries: [
      `SELECT DISTINCT name AS value
       FROM suppliers
       WHERE isDeleted = 0 AND name IS NOT NULL AND TRIM(name) <> ''`,
    ],
  },
  {
    dictType: 'supplier_product_name',
    queries: [
      `SELECT DISTINCT productName AS value
       FROM suppliers
       WHERE isDeleted = 0 AND productName IS NOT NULL AND TRIM(productName) <> ''`,
    ],
  },
  {
    dictType: 'supplier_project',
    queries: [
      `SELECT DISTINCT project AS value
       FROM suppliers
       WHERE isDeleted = 0 AND project IS NOT NULL AND TRIM(project) <> ''`,
    ],
  },
  {
    dictType: 'root_cause',
    queries: [
      `SELECT DISTINCT rootCause AS value
       FROM quality_records
       WHERE isDeleted = 0 AND rootCause IS NOT NULL AND TRIM(rootCause) <> ''`,
    ],
  },
  {
    dictType: 'supplier_brand',
    queries: [
      `SELECT DISTINCT supplierBrand AS value
       FROM after_sales
       WHERE isDeleted = 0 AND supplierBrand IS NOT NULL AND TRIM(supplierBrand) <> ''`,
    ],
  },
  {
    dictType: 'borrower_name',
    queries: [
      `SELECT DISTINCT borrowerName AS value
       FROM metrology_borrow_records
       WHERE isDeleted = 0 AND borrowerName IS NOT NULL AND TRIM(borrowerName) <> ''`,
    ],
  },
  {
    dictType: 'supervision_project_type',
    queries: [
      `SELECT DISTINCT projectType AS value
       FROM supervision_projects
       WHERE isDeleted = 0 AND projectType IS NOT NULL AND TRIM(projectType) <> ''`,
    ],
  },
  {
    dictType: 'standard_document_category',
    queries: [
      `SELECT DISTINCT category AS value
       FROM standard_documents
       WHERE isDeleted = 0 AND category IS NOT NULL AND TRIM(category) <> ''`,
    ],
  },
  {
    dictType: 'quality_loss_type',
    queries: [
      `SELECT DISTINCT type AS value
       FROM quality_losses
       WHERE isDeleted = 0 AND type IS NOT NULL AND TRIM(type) <> ''`,
    ],
  },
  {
    dictType: 'inspection_form_name',
    queries: [
      `SELECT DISTINCT formName AS value
       FROM inspection_form_templates
       WHERE isDeleted = 0 AND formName IS NOT NULL AND TRIM(formName) <> ''`,
    ],
  },
  {
    dictType: 'instrument_name',
    queries: [
      `SELECT DISTINCT instrumentName AS value
       FROM measuring_instruments
       WHERE isDeleted = 0 AND instrumentName IS NOT NULL AND TRIM(instrumentName) <> ''`,
    ],
  },
  {
    dictType: 'supervision_issue_type',
    queries: [
      `SELECT DISTINCT issueType AS value
       FROM supervision_issues
       WHERE isDeleted = 0 AND issueType IS NOT NULL AND TRIM(issueType) <> ''`,
    ],
  },
  {
    dictType: 'supervision_issue_action_type',
    queries: [
      `SELECT DISTINCT actionType AS value
       FROM supervision_issue_actions
       WHERE actionType IS NOT NULL AND TRIM(actionType) <> ''`,
    ],
  },
];

function normalizeValue(value: null | string) {
  return String(value || '').trim();
}

async function collectDistinctValues(queries: string[]) {
  const valueSet = new Set<string>();
  for (const sql of queries) {
    const rows = await prisma.$queryRawUnsafe<ValueRow[]>(sql);
    for (const row of rows) {
      const value = normalizeValue(row.value);
      if (value) {
        valueSet.add(value);
      }
    }
  }
  return [...valueSet].sort((a, b) => a.localeCompare(b, 'zh-CN'));
}

async function seedByConfig(config: SeedConfig) {
  const values = await collectDistinctValues(config.queries);
  let inserted = 0;

  for (const [sort, value] of values.entries()) {
    const affectedRows = await prisma.$executeRawUnsafe(
      `INSERT IGNORE INTO dictionaries (
         id, dictType, dictKey, dictValue, sort, status, isDeleted
       ) VALUES (?, ?, ?, ?, ?, 1, 0)`,
      randomUUID(),
      config.dictType,
      value,
      value,
      sort,
    );
    inserted += Number(affectedRows || 0);
  }

  return {
    dictType: config.dictType,
    collected: values.length,
    inserted,
  };
}

async function main() {
  const summaries = [];
  for (const config of SEED_CONFIGS) {
    const summary = await seedByConfig(config);
    summaries.push(summary);
    console.warn(
      `[seed-master-data-dictionaries] ${summary.dictType}: collected=${summary.collected}, inserted=${summary.inserted}`,
    );
  }
}

main()
  .catch((error: unknown) => {
    console.error('[seed-master-data-dictionaries] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
