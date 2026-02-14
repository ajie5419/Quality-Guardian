export type VxeExportMode = 'all' | 'current' | 'selected';
// cspell:ignore spreadsheetml

export interface CreateVxePhotoXlsxExportMethodOptions<
  Row extends Record<string, any>,
> {
  filename: (mode: VxeExportMode) => string;
  getPhotoUrl: (row: Row) => string;
  getRows: (params: {
    $grid: any;
    $table: any;
    mode: VxeExportMode;
    options: Record<string, any>;
  }) => Promise<Row[]> | Row[];
  photoField?: string;
  sheetName: string;
}

function resolveImageUrl(url: string) {
  const value = url.trim();
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith('//')) return `${window.location.protocol}${value}`;
  return new URL(value, window.location.origin).toString();
}

function getImageExtension(contentType?: string): 'gif' | 'jpeg' | 'png' {
  const lower = (contentType || '').toLowerCase();
  if (lower.includes('png')) return 'png';
  if (lower.includes('gif')) return 'gif';
  return 'jpeg';
}

async function fetchImageBuffer(
  url: string,
  cache: Map<
    string,
    { buffer: ArrayBuffer; extension: 'gif' | 'jpeg' | 'png' }
  >,
) {
  const fullUrl = resolveImageUrl(url);
  if (!fullUrl) return null;
  const cached = cache.get(fullUrl);
  if (cached) return cached;

  const response = await fetch(fullUrl);
  if (!response.ok) return null;

  const blob = await response.blob();
  const data = {
    buffer: await blob.arrayBuffer(),
    extension: getImageExtension(blob.type),
  };
  cache.set(fullUrl, data);
  return data;
}

function downloadWorkbook(buffer: ArrayBuffer, filename: string) {
  // cspell:disable-next-line
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const link = document.createElement('a');
  const objectUrl = URL.createObjectURL(blob);
  link.href = objectUrl;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

export function createVxePhotoXlsxExportMethod<Row extends Record<string, any>>(
  config: CreateVxePhotoXlsxExportMethodOptions<Row>,
) {
  return async ({
    options,
    $table,
    $grid,
  }: {
    $grid: any;
    $table: any;
    options: Record<string, any>;
  }) => {
    const mode = (options.mode || 'current') as VxeExportMode;
    const rows = await config.getRows({ mode, options, $table, $grid });
    const exceljs = await import('exceljs');
    const workbook = new exceljs.default.Workbook();
    const worksheet = workbook.addWorksheet(config.sheetName);
    const visibleColumns = (
      $table.getTableColumn?.().visibleColumn || []
    ).filter((column: any) => column.type === 'seq' || column.field);
    const photoField = config.photoField || 'photos';

    worksheet.columns = visibleColumns.map((column: any) => ({
      header: column.getTitle?.() || '',
      key: column.id,
      width: Math.max(10, Math.ceil((column.renderWidth || 100) / 8)),
    }));

    (rows || []).forEach((row) => {
      const rowData: Record<string, any> = {};
      visibleColumns.forEach((column: any) => {
        rowData[column.id] =
          column.field === photoField
            ? ''
            : ($table.getCellLabel(row, column) ?? '');
      });
      worksheet.addRow(rowData);
    });

    const photoColumnIndex = visibleColumns.findIndex(
      (column: any) => column.field === photoField,
    );

    if (photoColumnIndex !== -1) {
      const imageCache = new Map<
        string,
        { buffer: ArrayBuffer; extension: 'gif' | 'jpeg' | 'png' }
      >();

      for (const [i, row] of rows.entries()) {
        if (!row) continue;
        const photoUrl = config.getPhotoUrl(row);
        if (!photoUrl) continue;
        try {
          const imageData = await fetchImageBuffer(photoUrl, imageCache);
          if (!imageData) continue;
          const imageId = workbook.addImage({
            buffer: imageData.buffer,
            extension: imageData.extension,
          });
          const excelRow = i + 2;
          worksheet.getCell(excelRow, photoColumnIndex + 1).value = '';
          worksheet.getRow(excelRow).height = 34;
          worksheet.addImage(imageId, {
            tl: { col: photoColumnIndex + 0.15, row: excelRow - 1 + 0.1 },
            ext: { width: 38, height: 38 },
          });
        } catch {
          worksheet.getCell(i + 2, photoColumnIndex + 1).value = '';
        }
      }

      const photoColumn = worksheet.getColumn(photoColumnIndex + 1);
      photoColumn.width = Math.max(10, photoColumn.width || 10);
    }

    worksheet.eachRow((row) => {
      row.eachCell((cell) => {
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    downloadWorkbook(buffer as ArrayBuffer, config.filename(mode));
  };
}
