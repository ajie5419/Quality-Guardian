import type { Buffer } from 'node:buffer';

type XlsxWorkbook = {
  SheetNames?: string[];
  Sheets: Record<string, unknown>;
};

type ParseWorkbookOptions = {
  cellDates?: boolean;
};

type ParseSheetOptions = {
  defval?: unknown;
  header?: 1;
  raw?: boolean;
};

export async function parseWorkbook(
  buffer: Buffer,
  options: ParseWorkbookOptions = {},
): Promise<XlsxWorkbook> {
  const XLSX = await import('xlsx');
  return XLSX.read(buffer, {
    cellDates: options.cellDates,
    type: 'buffer',
  }) as XlsxWorkbook;
}

export async function parseSheet<T = Record<string, unknown>>(
  workbook: XlsxWorkbook,
  sheetName?: string,
  options: ParseSheetOptions = {},
): Promise<T[]> {
  const XLSX = await import('xlsx');
  const targetSheetName = sheetName || workbook.SheetNames?.[0];
  if (!targetSheetName) return [];
  const sheet = workbook.Sheets[targetSheetName];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json(sheet, {
    defval: options.defval ?? '',
    header: options.header,
    raw: options.raw ?? false,
  }) as T[];
}

export async function parseWorkbookSheets<T = Record<string, unknown>>(
  buffer: Buffer,
  options: ParseSheetOptions & ParseWorkbookOptions = {},
): Promise<Array<{ name: string; rows: T[] }>> {
  const workbook = await parseWorkbook(buffer, options);
  const names = workbook.SheetNames || [];
  const result: Array<{ name: string; rows: T[] }> = [];
  for (const name of names) {
    result.push({
      name,
      rows: await parseSheet<T>(workbook, name, options),
    });
  }
  return result;
}
