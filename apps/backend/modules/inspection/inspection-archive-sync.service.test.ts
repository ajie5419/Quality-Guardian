import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FileStorageService } from '~/modules/file-storage/file-storage.service';
import { syncInspectionArchiveTask } from '~/modules/inspection/inspection-archive-sync.service';
import { buildGovernedWriteFieldsForTable } from '~/utils/governed-write';

vi.mock('~/modules/file-storage/file-storage.service', () => ({
  FileStorageService: {
    registerReferencesFromAttachments: vi.fn(),
    softDeleteReferences: vi.fn(),
  },
}));

vi.mock('~/utils/governed-write', () => ({
  buildGovernedWriteFieldsForTable: vi
    .fn()
    .mockReturnValue({ projectName: 'Project A' }),
}));

vi.mock('~/utils/logger', () => ({
  createModuleLogger: vi.fn().mockReturnValue({ warn: vi.fn() }),
}));

vi.mock('~/utils/prisma-error', () => ({
  isPrismaSchemaMismatchError: vi.fn().mockReturnValue(false),
}));

function createTx() {
  return {
    inspection_archive_tasks: {
      deleteMany: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  } as any;
}

const baseSource = {
  documents: null,
  hasDocuments: false,
  id: 'insp-1',
  inspectionDate: new Date('2024-06-15'),
  inspector: 'Tester',
  projectName: 'Project A',
  remarks: '',
  result: 'PASS',
  workOrderNumber: 'WO-1',
};

describe('inspectionArchiveSyncService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should delete archive task when source does not require archive', async () => {
    const tx = createTx();
    tx.inspection_archive_tasks.findMany.mockResolvedValue([
      { id: 'task-1' },
      { id: 'task-2' },
    ]);

    await syncInspectionArchiveTask(tx, {
      ...baseSource,
      hasDocuments: false,
      result: 'PASS',
    });

    expect(tx.inspection_archive_tasks.deleteMany).toHaveBeenCalledWith({
      where: { inspectionId: 'insp-1' },
    });
    expect(FileStorageService.softDeleteReferences).toHaveBeenCalledTimes(2);
  });

  it('should not delete when source requires archive', async () => {
    const tx = createTx();
    tx.inspection_archive_tasks.upsert.mockResolvedValue({ id: 'task-new' });

    await syncInspectionArchiveTask(tx, {
      ...baseSource,
      hasDocuments: true,
    });

    expect(tx.inspection_archive_tasks.deleteMany).not.toHaveBeenCalled();
    expect(tx.inspection_archive_tasks.upsert).toHaveBeenCalled();
  });

  it('should create archive task when no existing task', async () => {
    const tx = createTx();
    tx.inspection_archive_tasks.findUnique.mockResolvedValue(null);
    tx.inspection_archive_tasks.upsert.mockResolvedValue({ id: 'task-new' });

    await syncInspectionArchiveTask(tx, {
      ...baseSource,
      hasDocuments: true,
    });

    expect(tx.inspection_archive_tasks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          inspectionId: 'insp-1',
          inspector: 'Tester',
          workOrderNumber: 'WO-1',
        }),
      }),
    );
  });

  it('should preserve ARCHIVED status when existing task is ARCHIVED', async () => {
    const tx = createTx();
    tx.inspection_archive_tasks.findUnique.mockResolvedValue({
      archivedAt: new Date('2024-06-20'),
      status: 'ARCHIVED',
    });
    tx.inspection_archive_tasks.upsert.mockResolvedValue({ id: 'task-1' });

    await syncInspectionArchiveTask(tx, {
      ...baseSource,
      documents: 'doc-ref',
      hasDocuments: true,
    });

    expect(tx.inspection_archive_tasks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ status: 'ARCHIVED' }),
      }),
    );
  });

  it('should set status to PENDING when no documents and not ARCHIVED', async () => {
    const tx = createTx();
    tx.inspection_archive_tasks.findUnique.mockResolvedValue(null);
    tx.inspection_archive_tasks.upsert.mockResolvedValue({ id: 'task-new' });

    await syncInspectionArchiveTask(tx, {
      ...baseSource,
      documents: null,
      hasDocuments: false,
      result: 'FAIL',
    });

    expect(tx.inspection_archive_tasks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ status: 'PENDING' }),
      }),
    );
  });

  it('should set status to ARCHIVED when documents are present and not previously archived', async () => {
    const tx = createTx();
    tx.inspection_archive_tasks.findUnique.mockResolvedValue(null);
    tx.inspection_archive_tasks.upsert.mockResolvedValue({ id: 'task-new' });

    await syncInspectionArchiveTask(tx, {
      ...baseSource,
      documents: 'doc-ref',
      hasDocuments: true,
    });

    expect(tx.inspection_archive_tasks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ status: 'ARCHIVED' }),
      }),
    );
  });

  it('should register file references after upsert', async () => {
    const tx = createTx();
    tx.inspection_archive_tasks.findUnique.mockResolvedValue(null);
    tx.inspection_archive_tasks.upsert.mockResolvedValue({ id: 'task-new' });

    await syncInspectionArchiveTask(tx, {
      ...baseSource,
      documents: 'doc-ref',
      hasDocuments: true,
    });

    expect(
      FileStorageService.registerReferencesFromAttachments,
    ).toHaveBeenCalledWith({
      attachments: 'doc-ref',
      bizId: 'task-new',
      bizType: 'inspection_archive_task',
      fieldName: 'attachments',
    });
  });

  it('should build work content from remarks when provided', async () => {
    const tx = createTx();
    tx.inspection_archive_tasks.findUnique.mockResolvedValue(null);
    tx.inspection_archive_tasks.upsert.mockResolvedValue({ id: 'task-new' });

    await syncInspectionArchiveTask(tx, {
      ...baseSource,
      documents: 'doc',
      hasDocuments: true,
      remarks: 'Please archive Q1 docs',
    });

    expect(tx.inspection_archive_tasks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          workContent: 'Please archive Q1 docs',
        }),
      }),
    );
  });

  it('should skip silently on schema mismatch error', async () => {
    const { isPrismaSchemaMismatchError } = await import(
      '~/utils/prisma-error'
    );
    (isPrismaSchemaMismatchError as any).mockReturnValue(true);
    const tx = createTx();
    tx.inspection_archive_tasks.findUnique.mockRejectedValue(
      new Error('schema mismatch'),
    );

    await syncInspectionArchiveTask(tx, {
      ...baseSource,
      hasDocuments: true,
    });

    expect(tx.inspection_archive_tasks.upsert).not.toHaveBeenCalled();
  });

  it('should rethrow non-schema-mismatch errors', async () => {
    const { isPrismaSchemaMismatchError } = await import(
      '~/utils/prisma-error'
    );
    (isPrismaSchemaMismatchError as any).mockReturnValue(false);
    const tx = createTx();
    tx.inspection_archive_tasks.findUnique.mockRejectedValue(
      new Error('real db error'),
    );

    await expect(
      syncInspectionArchiveTask(tx, { ...baseSource, hasDocuments: true }),
    ).rejects.toThrow('real db error');
  });

  it('should call buildGovernedWriteFieldsForTable', async () => {
    const tx = createTx();
    tx.inspection_archive_tasks.findUnique.mockResolvedValue(null);
    tx.inspection_archive_tasks.upsert.mockResolvedValue({ id: 'task-new' });

    await syncInspectionArchiveTask(tx, { ...baseSource, hasDocuments: true });

    expect(buildGovernedWriteFieldsForTable).toHaveBeenCalledWith(
      'inspection_archive_tasks',
      { projectName: 'Project A' },
    );
  });
});
