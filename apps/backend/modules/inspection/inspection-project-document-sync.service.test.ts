import { beforeEach, describe, expect, it, vi } from 'vitest';
import { syncInspectionProjectDocuments } from '~/modules/inspection/inspection-project-document-sync.service';

vi.mock('~/modules/file-storage/file-storage.service', () => ({
  FileStorageService: {
    registerReferencesFromAttachments: vi.fn(),
  },
}));

vi.mock('~/modules/inspection/project-documents', () => ({
  parseProjectDocuments: vi.fn().mockReturnValue([]),
  stringifyProjectDocuments: vi.fn().mockReturnValue('[]'),
  upsertInspectionProjectDocuments: vi.fn().mockReturnValue([]),
}));

vi.mock('~/utils/governed-write', () => ({
  buildGovernedWriteFieldsForTable: vi.fn().mockReturnValue({}),
}));

vi.mock('~/utils/prisma-error', () => ({
  isPrismaMissingColumnError: vi.fn().mockReturnValue(false),
}));

describe('syncInspectionProjectDocuments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create new project when none exists and documents non-empty', async () => {
    const { upsertInspectionProjectDocuments } = await import(
      '~/modules/inspection/project-documents'
    );
    vi.mocked(upsertInspectionProjectDocuments).mockReturnValue([
      {
        id: 'doc-1',
        workOrderNumber: 'WO-001',
        projectName: 'Project A',
        workContent: 'doc1.pdf',
        status: 'active',
        sourceType: 'INSPECTION',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      },
    ]);

    const tx = {
      doc_projects: {
        create: vi.fn().mockResolvedValue({ id: 'proj-1' }),
        findUnique: vi.fn().mockResolvedValue(null),
        update: vi.fn(),
      },
    } as any;

    await syncInspectionProjectDocuments(tx, {
      id: 'insp-1',
      workOrderNumber: 'WO-001',
    });

    expect(tx.doc_projects.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          workOrderNumber: 'WO-001',
          status: 'active',
        }),
      }),
    );
  });

  it('should skip creation when no documents exist and no project', async () => {
    const { upsertInspectionProjectDocuments } = await import(
      '~/modules/inspection/project-documents'
    );
    vi.mocked(upsertInspectionProjectDocuments).mockReturnValue([]);

    const tx = {
      doc_projects: {
        create: vi.fn(),
        findUnique: vi.fn().mockResolvedValue(null),
        update: vi.fn(),
      },
    } as any;

    await syncInspectionProjectDocuments(tx, {
      id: 'insp-1',
      workOrderNumber: 'WO-001',
    });

    expect(tx.doc_projects.create).not.toHaveBeenCalled();
  });

  it('should update existing project documents', async () => {
    const { upsertInspectionProjectDocuments } = await import(
      '~/modules/inspection/project-documents'
    );
    vi.mocked(upsertInspectionProjectDocuments).mockReturnValue([
      {
        id: 'doc-1',
        workOrderNumber: 'WO-001',
        projectName: 'Project A',
        workContent: 'doc1.pdf',
        status: 'active',
        sourceType: 'INSPECTION',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      },
    ]);

    const tx = {
      doc_projects: {
        create: vi.fn(),
        findUnique: vi.fn().mockResolvedValue({
          documents: '[]',
          id: 'proj-1',
          projectName: 'Project A',
        }),
        update: vi.fn(),
      },
    } as any;

    await syncInspectionProjectDocuments(tx, {
      id: 'insp-1',
      workOrderNumber: 'WO-001',
    });

    expect(tx.doc_projects.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'proj-1' },
      }),
    );
  });

  it('should register file references after update', async () => {
    const { FileStorageService } = await import(
      '~/modules/file-storage/file-storage.service'
    );
    const { upsertInspectionProjectDocuments } = await import(
      '~/modules/inspection/project-documents'
    );
    vi.mocked(upsertInspectionProjectDocuments).mockReturnValue([
      {
        id: 'doc-1',
        workOrderNumber: 'WO-001',
        projectName: 'Project A',
        workContent: 'doc1.pdf',
        status: 'active',
        sourceType: 'INSPECTION',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      },
    ]);

    const tx = {
      doc_projects: {
        create: vi.fn(),
        findUnique: vi.fn().mockResolvedValue({
          documents: '[]',
          id: 'proj-1',
          projectName: 'Project A',
        }),
        update: vi.fn(),
      },
    } as any;

    await syncInspectionProjectDocuments(tx, {
      id: 'insp-1',
      workOrderNumber: 'WO-001',
    });

    expect(
      FileStorageService.registerReferencesFromAttachments,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        bizId: 'proj-1',
        bizType: 'doc_project',
      }),
    );
  });

  it('should register file references after create', async () => {
    const { FileStorageService } = await import(
      '~/modules/file-storage/file-storage.service'
    );
    const { upsertInspectionProjectDocuments } = await import(
      '~/modules/inspection/project-documents'
    );
    vi.mocked(upsertInspectionProjectDocuments).mockReturnValue([
      {
        id: 'doc-1',
        workOrderNumber: 'WO-001',
        projectName: 'Project A',
        workContent: 'doc1.pdf',
        status: 'active',
        sourceType: 'INSPECTION',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      },
    ]);

    const tx = {
      doc_projects: {
        create: vi.fn().mockResolvedValue({ id: 'proj-new' }),
        findUnique: vi.fn().mockResolvedValue(null),
        update: vi.fn(),
      },
    } as any;

    await syncInspectionProjectDocuments(tx, {
      id: 'insp-1',
      workOrderNumber: 'WO-001',
    });

    expect(
      FileStorageService.registerReferencesFromAttachments,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        bizId: 'proj-new',
        bizType: 'doc_project',
      }),
    );
  });

  it('should use workOrderNumber as projectName when source has no projectName', async () => {
    const { upsertInspectionProjectDocuments } = await import(
      '~/modules/inspection/project-documents'
    );
    vi.mocked(upsertInspectionProjectDocuments).mockReturnValue([
      {
        id: 'doc-1',
        workOrderNumber: 'WO-001',
        projectName: 'Project A',
        workContent: 'doc1.pdf',
        status: 'active',
        sourceType: 'INSPECTION',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      },
    ]);

    const tx = {
      doc_projects: {
        create: vi.fn().mockResolvedValue({ id: 'proj-1' }),
        findUnique: vi.fn().mockResolvedValue(null),
        update: vi.fn(),
      },
    } as any;

    await syncInspectionProjectDocuments(tx, {
      id: 'insp-1',
      workOrderNumber: 'WO-001',
    });

    const createData = tx.doc_projects.create.mock.calls[0][0].data;
    expect(createData.projectName).toBe('WO-001');
  });

  it('should silently skip on missing column error', async () => {
    const { isPrismaMissingColumnError } = await import('~/utils/prisma-error');
    vi.mocked(isPrismaMissingColumnError).mockReturnValue(true);

    const tx = {
      doc_projects: {
        create: vi.fn().mockRejectedValue(new Error('missing column')),
        findUnique: vi.fn().mockRejectedValue(new Error('missing column')),
        update: vi.fn(),
      },
    } as any;

    await expect(
      syncInspectionProjectDocuments(tx, {
        id: 'insp-1',
        workOrderNumber: 'WO-001',
      }),
    ).resolves.toBeUndefined();
  });

  it('should rethrow non-missing-column errors', async () => {
    const { isPrismaMissingColumnError } = await import('~/utils/prisma-error');
    vi.mocked(isPrismaMissingColumnError).mockReturnValue(false);

    const tx = {
      doc_projects: {
        findUnique: vi.fn().mockRejectedValue(new Error('db error')),
        update: vi.fn(),
      },
    } as any;

    await expect(
      syncInspectionProjectDocuments(tx, {
        id: 'insp-1',
        workOrderNumber: 'WO-001',
      }),
    ).rejects.toThrow('db error');
  });
});
