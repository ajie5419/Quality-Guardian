import { defineEventHandler, setHeader } from 'h3';
import { MetrologyService } from '~/modules/metrology/metrology.service';
import { logApiError } from '~/utils/api-logger';
import { internalServerErrorResponse } from '~/utils/response';

export default defineEventHandler(async (event) => {
  try {
    const XLSX = await import('xlsx');
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.json_to_sheet(MetrologyService.getTemplateRows());
    XLSX.utils.book_append_sheet(workbook, sheet, 'Template');
    const buffer = XLSX.write(workbook, {
      bookType: 'xlsx',
      type: 'buffer',
    });

    setHeader(
      event,
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    setHeader(
      event,
      'Content-Disposition',
      'attachment; filename="measuring-instruments-template.xlsx"',
    );
    return buffer;
  } catch (error) {
    logApiError('metrology-template', error, undefined, event);
    return internalServerErrorResponse(
      event,
      'Failed to generate metrology template',
    );
  }
});
