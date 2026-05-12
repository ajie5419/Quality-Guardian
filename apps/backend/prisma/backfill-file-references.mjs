/* eslint-disable no-console */
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
      // Support local source, container and built deployment layouts.
    }
  }
  throw new Error(
    'Unable to resolve @prisma/client for file reference backfill',
  );
}

const { PrismaClient } = loadPrismaClient();
const prisma = new PrismaClient();
const dryRun = process.argv.includes('--dry-run');

const sources = [
  {
    bizType: 'after_sales',
    fieldName: 'photos',
    model: 'after_sales',
    select: { id: true, photos: true },
    valueKey: 'photos',
    where: { isDeleted: false, photos: { not: null } },
  },
  {
    bizType: 'inspection_form_template',
    fieldName: 'attachments',
    model: 'inspection_form_templates',
    select: { attachments: true, id: true },
    valueKey: 'attachments',
    where: { isDeleted: false, attachments: { not: null } },
  },
  {
    bizType: 'doc_project',
    fieldName: 'documents',
    model: 'doc_projects',
    select: { documents: true, id: true },
    valueKey: 'documents',
    where: { isDeleted: false, documents: { not: null } },
  },
  {
    bizType: 'quality_plan',
    fieldName: 'documents',
    model: 'quality_plans',
    select: { documents: true, id: true },
    valueKey: 'documents',
    where: { isDeleted: false, documents: { not: null } },
  },
  {
    bizType: 'inspection_record',
    fieldName: 'documents',
    model: 'inspections',
    select: { documents: true, id: true },
    valueKey: 'documents',
    where: { isDeleted: false, documents: { not: null } },
  },
  {
    bizType: 'inspection_archive_task',
    fieldName: 'attachments',
    model: 'inspection_archive_tasks',
    select: { attachments: true, id: true },
    valueKey: 'attachments',
    where: { attachments: { not: null }, isDeleted: false },
  },
  {
    bizType: 'inspection_request',
    fieldName: 'attachments',
    model: 'qms_inspection_requests',
    select: { attachments: true, id: true },
    valueKey: 'attachments',
    where: { isDeleted: false, attachments: { not: null } },
  },
  {
    bizType: 'inspection_request',
    fieldName: 'closeAttachments',
    model: 'qms_inspection_requests',
    select: { closeAttachments: true, id: true },
    valueKey: 'closeAttachments',
    where: { isDeleted: false, closeAttachments: { not: null } },
  },
  {
    bizType: 'knowledge_base',
    fieldName: 'attachments',
    model: 'knowledge_base',
    select: { attachment: true, id: true },
    valueKey: 'attachment',
    where: { isDeleted: false, attachment: { not: null } },
  },
  {
    bizType: 'inspection_issue',
    fieldName: 'photos',
    model: 'quality_records',
    select: { id: true, issuePhoto: true },
    valueKey: 'issuePhoto',
    where: { isDeleted: false, issuePhoto: { not: null } },
  },
  {
    bizType: 'work_order_requirement',
    fieldName: 'attachments',
    model: 'work_order_requirements',
    select: { attachment: true, id: true },
    valueKey: 'attachment',
    where: { isDeleted: false, attachment: { not: null } },
  },
];

function parseAttachments(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'object') return [value];
  try {
    const parsed = JSON.parse(String(value));
    if (Array.isArray(parsed)) return parsed;
    return parsed ? [parsed] : [];
  } catch {
    return [];
  }
}

function extractStoredName(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const withoutQuery = raw.split('?')[0] || '';
  const normalized = withoutQuery.replace(/^\/api\/uploads\//, '/uploads/');
  const filename = normalized.split('/').findLast(Boolean) || '';
  return filename.startsWith('oss_') ? filename.slice(4) : filename;
}

async function findFileId(item) {
  if (!item || typeof item !== 'object') return null;
  const record = item;
  const explicitId = String(record.fileId || record.id || '').trim();
  if (explicitId) {
    const file = await prisma.file_assets.findFirst({
      select: { id: true },
      where: { id: explicitId, status: { not: 'DELETED' } },
    });
    if (file) return file.id;
  }

  const storedName = extractStoredName(
    record.url || record.thumbUrl || record.path || record.filename,
  );
  if (!storedName) return null;

  const file = await prisma.file_assets.findFirst({
    select: { id: true },
    where: {
      OR: [
        { storedName },
        { objectKey: { endsWith: storedName } },
        { thumbObjectKey: { endsWith: storedName } },
      ],
      status: { not: 'DELETED' },
    },
  });
  return file?.id || null;
}

async function backfillSource(source) {
  const rows = await prisma[source.model].findMany({
    select: source.select,
    where: source.where,
  });
  let created = 0;
  let matched = 0;

  for (const row of rows) {
    const items = parseAttachments(row[source.valueKey]);
    const fileIds = [];
    for (const item of items) {
      const fileId = await findFileId(item);
      if (fileId) fileIds.push(fileId);
    }
    const uniqueFileIds = [...new Set(fileIds)];
    if (uniqueFileIds.length === 0) continue;

    matched += uniqueFileIds.length;
    if (dryRun) continue;

    await prisma.file_references.deleteMany({
      where: {
        bizId: String(row.id),
        bizType: source.bizType,
        fieldName: source.fieldName,
      },
    });
    const result = await prisma.file_references.createMany({
      data: uniqueFileIds.map((fileId, index) => ({
        bizId: String(row.id),
        bizType: source.bizType,
        fieldName: source.fieldName,
        fileId,
        sortOrder: index,
      })),
      skipDuplicates: true,
    });
    created += result.count;
  }

  return { created, matched, rows: rows.length };
}

async function main() {
  console.log(`[backfill-file-references] start${dryRun ? ' (dry-run)' : ''}`);
  for (const source of sources) {
    const result = await backfillSource(source);
    console.log(
      `[backfill-file-references] ${source.bizType}.${source.fieldName}: rows=${result.rows}, matched=${result.matched}, created=${result.created}`,
    );
  }
  console.log('[backfill-file-references] done');
}

main()
  .catch((error) => {
    console.error('[backfill-file-references] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
