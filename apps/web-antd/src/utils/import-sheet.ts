function normalizeSheetKey(value: unknown) {
  return String(value ?? '')
    .replaceAll(/\s+/g, '')
    .toLowerCase();
}

export async function readImportRowsFromFile(file: File) {
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

  return XLSX.utils.sheet_to_json(worksheet) as Record<string, unknown>[];
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
