import { beforeEach, describe, expect, it, vi } from 'vitest';
import { syncInspectionArchiveTask as archiveSync } from '~/modules/inspection/inspection-archive-sync.service';
import { syncInspectionProjectDocuments as docSync } from '~/modules/inspection/inspection-project-document-sync.service';
import {
  resolveInspectionTemplateBinding,
  syncInspectionArchiveTask,
  syncInspectionProjectDocuments,
} from '~/modules/inspection/inspection-record-sync.service';
import { resolveInspectionTemplateBinding as templateBinding } from '~/modules/inspection/inspection-template-binding.service';

vi.mock('~/modules/inspection/inspection-archive-sync.service', () => ({
  syncInspectionArchiveTask: vi.fn(),
}));

vi.mock(
  '~/modules/inspection/inspection-project-document-sync.service',
  () => ({
    syncInspectionProjectDocuments: vi.fn(),
  }),
);

vi.mock('~/modules/inspection/inspection-template-binding.service', () => ({
  resolveInspectionTemplateBinding: vi.fn(),
}));

describe('inspection-record-sync.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should export syncInspectionArchiveTask', () => {
    expect(syncInspectionArchiveTask).toBe(archiveSync);
  });

  it('should export syncInspectionProjectDocuments', () => {
    expect(syncInspectionProjectDocuments).toBe(docSync);
  });

  it('should export resolveInspectionTemplateBinding', () => {
    expect(resolveInspectionTemplateBinding).toBe(templateBinding);
  });
});
