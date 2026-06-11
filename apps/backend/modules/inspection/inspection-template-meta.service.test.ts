import { Buffer } from 'node:buffer';

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveTemplateMetaFromAttachment } from '~/modules/inspection/inspection-template-meta.service';

const { mockExistsSync, mockReadFile, mockParseWorkbookSheets } = vi.hoisted(
  () => ({
    mockExistsSync: vi.fn().mockReturnValue(false),
    mockParseWorkbookSheets: vi.fn(),
    mockReadFile: vi.fn(),
  }),
);

vi.mock('node:fs', () => {
  const mod = { existsSync: mockExistsSync };
  return { ...mod, default: mod };
});

vi.mock('node:fs/promises', () => {
  const mod = { readFile: mockReadFile };
  return { ...mod, default: mod };
});

vi.mock('~/utils/excel-parser', () => ({
  parseWorkbookSheets: mockParseWorkbookSheets,
}));

vi.mock('~/utils/logger', () => ({
  createModuleLogger: vi.fn(() => ({
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  })),
}));

vi.mock('~/utils/paths', () => ({
  UPLOAD_DIR: '/tmp/uploads',
}));

describe('resolveTemplateMetaFromAttachment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExistsSync.mockReturnValue(false);
  });

  it('should return null meta when attachment is empty', async () => {
    const result = await resolveTemplateMetaFromAttachment(null);
    expect(result).toEqual({ drawingNo: null, formNo: null });
  });

  it('should return null meta for non-excel file extension', async () => {
    const result = await resolveTemplateMetaFromAttachment(
      'https://example.com/file.pdf',
    );
    expect(result).toEqual({ drawingNo: null, formNo: null });
  });

  it('should return null meta for .doc file', async () => {
    const result = await resolveTemplateMetaFromAttachment(
      'https://example.com/file.doc',
    );
    expect(result).toEqual({ drawingNo: null, formNo: null });
  });

  it('should return null meta when file not found on disk', async () => {
    mockExistsSync.mockReturnValue(false);

    const result = await resolveTemplateMetaFromAttachment(
      'https://example.com/template.xlsx',
    );
    expect(result).toEqual({ drawingNo: null, formNo: null });
  });

  it('should return null meta when filename cannot be decoded', async () => {
    const result = await resolveTemplateMetaFromAttachment('');
    expect(result).toEqual({ drawingNo: null, formNo: null });
  });

  it('should parse formNo and drawingNo from xlsx', async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFile.mockResolvedValue(Buffer.from('data'));
    mockParseWorkbookSheets.mockResolvedValue([
      {
        rows: [['表单号及版本', 'FM-QMS-001', '图号', 'DW-123']],
      },
    ]);

    const result = await resolveTemplateMetaFromAttachment(
      'https://example.com/template.xlsx',
    );
    expect(result).toEqual({
      drawingNo: 'DW-123',
      formNo: 'FM-QMS-001',
    });
  });

  it('should return null meta when parseWorkbookSheets throws', async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFile.mockResolvedValue(Buffer.from('data'));
    mockParseWorkbookSheets.mockRejectedValue(new Error('parse error'));

    const result = await resolveTemplateMetaFromAttachment(
      'https://example.com/template.xlsx',
    );
    expect(result).toEqual({ drawingNo: null, formNo: null });
  });

  it('should return null meta when no matching rows found', async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFile.mockResolvedValue(Buffer.from('data'));
    mockParseWorkbookSheets.mockResolvedValue([
      {
        rows: [['Header', 'Value']],
      },
    ]);

    const result = await resolveTemplateMetaFromAttachment(
      'https://example.com/template.xlsx',
    );
    expect(result).toEqual({ drawingNo: null, formNo: null });
  });

  it('should handle URL with query params', async () => {
    mockExistsSync.mockReturnValue(false);

    const result = await resolveTemplateMetaFromAttachment(
      'https://example.com/file.xlsx?token=abc',
    );
    expect(result).toEqual({ drawingNo: null, formNo: null });
  });

  it('should handle csv files', async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFile.mockResolvedValue(Buffer.from('data'));
    mockParseWorkbookSheets.mockResolvedValue([
      {
        rows: [['Drawing No', 'DW-456']],
      },
    ]);

    const result = await resolveTemplateMetaFromAttachment(
      'https://example.com/template.csv',
    );
    expect(result).toEqual({
      drawingNo: 'DW-456',
      formNo: null,
    });
  });
});
