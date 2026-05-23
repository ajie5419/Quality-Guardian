/* eslint-disable no-console */
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import process from 'node:process';

const require = createRequire(import.meta.url);

function loadPrismaClient() {
  const candidates = [
    '@prisma/client',
    '../node_modules/@prisma/client',
    '../apps/backend/node_modules/@prisma/client',
  ];

  for (const candidate of candidates) {
    try {
      return require(candidate);
    } catch {
      // Keep trying across local and container layouts.
    }
  }

  throw new Error(
    'Unable to resolve @prisma/client for dictionaries migration',
  );
}

const { PrismaClient } = loadPrismaClient();
const prisma = new PrismaClient();

async function tableExists(name) {
  const rows = await prisma.$queryRawUnsafe(
    'SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?',
    name,
  );
  return rows.length > 0;
}

async function indexExists(tableName, indexName) {
  const rows = await prisma.$queryRawUnsafe(
    'SELECT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?',
    tableName,
    indexName,
  );
  return rows.length > 0;
}

async function uniqueIndexExists(tableName, indexName) {
  const rows = await prisma.$queryRawUnsafe(
    'SELECT INDEX_NAME, NON_UNIQUE FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ? LIMIT 1',
    tableName,
    indexName,
  );
  if (rows.length === 0) return false;
  return Number(rows[0].NON_UNIQUE) === 0;
}

async function addIndex(tableName, indexName, columns, dryRun) {
  if (await indexExists(tableName, indexName)) return;
  if (dryRun) {
    console.log(`[dictionaries-migrate] would add index ${indexName}`);
    return;
  }
  await prisma.$executeRawUnsafe(
    `ALTER TABLE \`${tableName}\` ADD INDEX \`${indexName}\` (${columns})`,
  );
}

async function addUniqueIndex(tableName, indexName, columns, dryRun) {
  if (await uniqueIndexExists(tableName, indexName)) return;
  if (dryRun) {
    console.log(`[dictionaries-migrate] would add unique index ${indexName}`);
    return;
  }
  await prisma.$executeRawUnsafe(
    `ALTER TABLE \`${tableName}\` ADD UNIQUE INDEX \`${indexName}\` (${columns})`,
  );
}

const DEFAULT_DICTIONARIES = [
  {
    dictType: 'supplier_status',
    items: [
      { dictKey: 'Qualified', dictValue: 'Qualified', sort: 10 },
      { dictKey: 'Trial', dictValue: 'Trial', sort: 20 },
      { dictKey: 'Observation', dictValue: 'Observation', sort: 30 },
      { dictKey: 'Frozen', dictValue: 'Frozen', sort: 40 },
    ],
  },
  {
    dictType: 'metrology_inspection_status',
    items: [
      { dictKey: 'VALID', dictValue: 'VALID', sort: 10 },
      { dictKey: 'EXPIRED', dictValue: 'EXPIRED', sort: 20 },
      { dictKey: 'PENDING', dictValue: 'PENDING', sort: 30 },
      { dictKey: 'DISABLED', dictValue: 'DISABLED', sort: 40 },
    ],
  },
  {
    dictType: 'after_sales_status',
    items: [
      { dictKey: 'IN_PROGRESS', dictValue: 'IN_PROGRESS', sort: 10 },
      { dictKey: 'COMPLETED', dictValue: 'COMPLETED', sort: 20 },
    ],
  },
  {
    dictType: 'inspection_issue_status',
    items: [
      { dictKey: 'OPEN', dictValue: 'OPEN', sort: 10 },
      { dictKey: 'IN_PROGRESS', dictValue: 'IN_PROGRESS', sort: 20 },
      { dictKey: 'CLOSED', dictValue: 'CLOSED', sort: 30 },
    ],
  },
  {
    dictType: 'quality_loss_status',
    items: [
      { dictKey: 'Pending', dictValue: 'Pending', sort: 10 },
      { dictKey: 'Processing', dictValue: 'Processing', sort: 20 },
      { dictKey: 'Confirmed', dictValue: 'Confirmed', sort: 30 },
      { dictKey: 'Resolved', dictValue: 'Resolved', sort: 40 },
    ],
  },
  {
    dictType: 'quality_loss_type',
    items: [
      { dictKey: 'Scrap', dictValue: '报废 (Scrap)', sort: 10 },
      { dictKey: 'Rework', dictValue: '返工 (Rework)', sort: 20 },
      { dictKey: 'Return', dictValue: '退货 (Return)', sort: 30 },
      { dictKey: 'Transport', dictValue: '额外物流', sort: 40 },
      { dictKey: 'Other', dictValue: '其他', sort: 50 },
    ],
  },
  {
    dictType: 'inspection_process_name',
    items: [
      { dictKey: '外购件', dictValue: '外购件', sort: 10 },
      { dictKey: '原材料', dictValue: '原材料', sort: 20 },
      { dictKey: '辅材', dictValue: '辅材', sort: 30 },
      { dictKey: '机加成品件', dictValue: '机加成品件', sort: 40 },
      { dictKey: '设计', dictValue: '设计', sort: 50 },
      { dictKey: '下料', dictValue: '下料', sort: 60 },
      { dictKey: '组对', dictValue: '组对', sort: 70 },
      { dictKey: '焊接', dictValue: '焊接', sort: 80 },
      { dictKey: '机加', dictValue: '机加', sort: 90 },
      { dictKey: '探伤', dictValue: '探伤', sort: 100 },
      { dictKey: '焊后尺寸', dictValue: '焊后尺寸', sort: 110 },
      { dictKey: '外观', dictValue: '外观', sort: 120 },
      { dictKey: '整体拼装', dictValue: '整体拼装', sort: 130 },
      { dictKey: '组装', dictValue: '组装', sort: 140 },
      { dictKey: '装配', dictValue: '装配', sort: 150 },
      { dictKey: '组拼', dictValue: '组拼', sort: 160 },
      { dictKey: '打砂', dictValue: '打砂', sort: 170 },
      { dictKey: '喷漆', dictValue: '喷漆', sort: 180 },
      { dictKey: '涂装', dictValue: '涂装', sort: 190 },
      { dictKey: '成品检验', dictValue: '成品检验', sort: 200 },
    ],
  },
  {
    dictType: 'inspection_form_name',
    items: [],
  },
  {
    dictType: 'defect_type',
    items: [],
  },
  {
    dictType: 'defect_subtype',
    items: [],
  },
  {
    dictType: 'dfmea_cause',
    items: [],
  },
  {
    dictType: 'itp_process_step',
    items: [],
  },
  {
    dictType: 'task_dispatch_type',
    items: [],
  },
  {
    dictType: 'team',
    items: [],
  },
  {
    dictType: 'incoming_type',
    items: [],
  },
  {
    dictType: 'material_name',
    items: [],
  },
  {
    dictType: 'component_name',
    items: [],
  },
  {
    dictType: 'customer_name',
    items: [],
  },
  {
    dictType: 'requirement_name',
    items: [],
  },
  {
    dictType: 'instrument_name',
    items: [],
  },
  {
    dictType: 'quality_record_category',
    items: [],
  },
  {
    dictType: 'division',
    items: [],
  },
  {
    dictType: 'planning_project_status',
    items: [
      { dictKey: 'draft', dictValue: '草稿', sort: 10 },
      { dictKey: 'active', dictValue: '启用', sort: 20 },
      { dictKey: 'archived', dictValue: '归档', sort: 30 },
    ],
  },
  {
    dictType: 'supervision_project_status',
    items: [
      { dictKey: 'PLANNED', dictValue: '计划中', sort: 10 },
      { dictKey: 'IN_PROGRESS', dictValue: '进行中', sort: 20 },
      { dictKey: 'PAUSED', dictValue: '暂停', sort: 30 },
      { dictKey: 'COMPLETED', dictValue: '已完成', sort: 40 },
    ],
  },
  {
    dictType: 'supervision_issue_status',
    items: [
      { dictKey: 'OPEN', dictValue: '待处理', sort: 10 },
      { dictKey: 'IN_PROGRESS', dictValue: '处理中', sort: 20 },
      { dictKey: 'VERIFYING', dictValue: '验证中', sort: 30 },
      { dictKey: 'CLOSED', dictValue: '已关闭', sort: 40 },
    ],
  },
  {
    dictType: 'standard_document_category',
    items: [],
  },
  {
    dictType: 'supplier_brand',
    items: [],
  },
  {
    dictType: 'supplier_entity_name',
    items: [],
  },
  {
    dictType: 'supplier_product_name',
    items: [],
  },
  {
    dictType: 'borrower_name',
    items: [],
  },
  {
    dictType: 'supplier_project',
    items: [],
  },
  {
    dictType: 'root_cause',
    items: [],
  },
  {
    dictType: 'supplier_category',
    items: [],
  },
  {
    dictType: 'supervision_issue_type',
    items: [],
  },
  {
    dictType: 'supervision_issue_action_type',
    items: [],
  },
  {
    dictType: 'supervision_project_type',
    items: [],
  },
];

async function hasDictionaryItem(dictType, dictKey) {
  const rows = await prisma.$queryRawUnsafe(
    'SELECT id FROM dictionaries WHERE dictType = ? AND dictKey = ? AND isDeleted = 0 LIMIT 1',
    dictType,
    dictKey,
  );
  return rows.length > 0;
}

async function cleanupDuplicateActiveDictionaries(dryRun) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT dictType, dictKey, COUNT(*) AS duplicateCount
     FROM dictionaries
     WHERE isDeleted = 0
     GROUP BY dictType, dictKey
     HAVING COUNT(*) > 1`,
  );

  for (const row of rows) {
    const dictType = String(row.dictType || '');
    const dictKey = String(row.dictKey || '');
    const records = await prisma.$queryRawUnsafe(
      `SELECT id
       FROM dictionaries
       WHERE dictType = ? AND dictKey = ? AND isDeleted = 0
       ORDER BY updatedAt DESC, createdAt DESC, id DESC`,
      dictType,
      dictKey,
    );
    const keep = String(records[0]?.id || '');
    const removeIds = records
      .slice(1)
      .map((item) => String(item.id || ''))
      .filter(Boolean);
    if (removeIds.length === 0) continue;

    if (dryRun) {
      console.log(
        `[dictionaries-migrate] would soft-delete duplicate keys ${dictType}:${dictKey}, keep=${keep}, remove=${removeIds.length}`,
      );
      continue;
    }

    const placeholders = removeIds.map(() => '?').join(',');
    await prisma.$executeRawUnsafe(
      `UPDATE dictionaries
       SET isDeleted = 1, updatedBy = ?, updatedAt = NOW(3)
       WHERE id IN (${placeholders})`,
      'system',
      ...removeIds,
    );
  }
}

async function seedDefaultDictionaries(dryRun) {
  for (const group of DEFAULT_DICTIONARIES) {
    for (const item of group.items) {
      const exists = await hasDictionaryItem(group.dictType, item.dictKey);
      if (exists) continue;
      if (dryRun) {
        console.log(
          `[dictionaries-migrate] would seed ${group.dictType}:${item.dictKey}`,
        );
        continue;
      }
      await prisma.$executeRawUnsafe(
        `INSERT INTO dictionaries (
          id, dictType, dictKey, dictValue, sort, status, remark, isSystem, isDeleted, createdBy, updatedBy, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, 0, ?, ?, NOW(3), NOW(3))`,
        randomUUID(),
        group.dictType,
        item.dictKey,
        item.dictValue,
        item.sort,
        1,
        1,
        'system',
        'system',
      );
    }
  }
}

function printDefaultSeedPlan() {
  for (const group of DEFAULT_DICTIONARIES) {
    for (const item of group.items) {
      console.log(
        `[dictionaries-migrate] would seed ${group.dictType}:${item.dictKey}`,
      );
    }
  }
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  console.log(`[dictionaries-migrate] start${dryRun ? ' (dry-run)' : ''}`);

  const dictionariesExists = await tableExists('dictionaries');
  if (!dictionariesExists) {
    if (dryRun) {
      console.log('[dictionaries-migrate] would create dictionaries table');
    } else {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE \`dictionaries\` (
          \`id\` VARCHAR(191) NOT NULL,
          \`dictType\` VARCHAR(191) NOT NULL,
          \`dictKey\` VARCHAR(191) NOT NULL,
          \`dictValue\` VARCHAR(191) NOT NULL,
          \`sort\` INTEGER NOT NULL DEFAULT 0,
          \`status\` INTEGER NOT NULL DEFAULT 1,
          \`remark\` TEXT NULL,
          \`isSystem\` BOOLEAN NOT NULL DEFAULT false,
          \`isDeleted\` BOOLEAN NOT NULL DEFAULT false,
          \`createdBy\` VARCHAR(191) NULL,
          \`updatedBy\` VARCHAR(191) NULL,
          \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
          PRIMARY KEY (\`id\`)
        ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
      `);
    }
  }

  await addIndex(
    'dictionaries',
    'dictionaries_dictType_idx',
    '`dictType`',
    dryRun,
  );
  await addIndex(
    'dictionaries',
    'dictionaries_dictType_status_idx',
    '`dictType`, `status`',
    dryRun,
  );
  await addIndex(
    'dictionaries',
    'dictionaries_dictType_dictKey_idx',
    '`dictType`, `dictKey`',
    dryRun,
  );

  if (dryRun && !dictionariesExists) {
    await addUniqueIndex(
      'dictionaries',
      'dictionaries_dictType_dictKey_isDeleted_uidx',
      '`dictType`, `dictKey`, `isDeleted`',
      dryRun,
    );
    printDefaultSeedPlan();
    console.log('[dictionaries-migrate] done');
    return;
  }

  await cleanupDuplicateActiveDictionaries(dryRun);
  await addUniqueIndex(
    'dictionaries',
    'dictionaries_dictType_dictKey_isDeleted_uidx',
    '`dictType`, `dictKey`, `isDeleted`',
    dryRun,
  );
  await seedDefaultDictionaries(dryRun);

  console.log('[dictionaries-migrate] done');
}

main()
  .catch((error) => {
    console.error('[dictionaries-migrate] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
