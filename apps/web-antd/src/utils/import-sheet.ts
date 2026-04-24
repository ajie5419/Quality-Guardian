function normalizeSheetKey(value: unknown) {
  return String(value ?? '')
    .replaceAll(/\s+/g, '')
    .toLowerCase();
}

interface ReadImportRowsOptions {
  defval?: unknown;
  raw?: boolean;
  range?: number;
}

interface ReadSheetMatrixOptions {
  blankRows?: boolean;
  defval?: unknown;
  raw?: boolean;
}

export async function readImportRowsFromFile(
  file: File,
  options?: ReadImportRowsOptions,
) {
  const XLSX = await import('xlsx');
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, {
    type: 'array',
    cellDates: true,
  });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];
  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet) return [];

  return XLSX.utils.sheet_to_json(worksheet, {
    defval: options?.defval ?? '',
    raw: options?.raw ?? true,
    range: options?.range ?? 0,
  }) as Record<string, unknown>[];
}

export async function readSheetMatrixFromFile(
  file: File,
  options?: ReadSheetMatrixOptions,
) {
  const XLSX = await import('xlsx');
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, {
    type: 'array',
    cellDates: true,
  });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];
  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet) return [];

  return XLSX.utils.sheet_to_json(worksheet, {
    blankrows: options?.blankRows ?? false,
    defval: options?.defval ?? '',
    header: 1,
    raw: options?.raw ?? true,
  }) as unknown[][];
}

export function mapRowsByColumnTitles(
  rows: Record<string, unknown>[],
  columns: Array<{ field?: null | string; title?: unknown }>,
) {
  return rows.map((row) => {
    const item: Record<string, unknown> = {};
    columns.forEach((column) => {
      if (!column.field || !column.title) return;
      const excelKey = Object.keys(row).find(
        (key) => normalizeSheetKey(key) === normalizeSheetKey(column.title),
      );
      if (!excelKey) return;

      let value = row[excelKey];
      if (value instanceof Date) {
        value = value.toISOString().split('T')[0];
      }
      item[column.field] = value;
    });
    return item;
  });
}
