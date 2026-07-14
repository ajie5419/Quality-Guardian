import { defineEventHandler, readBody } from 'h3';
import {
  buildImportRowError,
  buildImportSummary,
  inferImportErrorField,
  toImportErrorMessage,
} from '~/modules/file-storage/import-report';
import { InspectionService } from '~/modules/inspection/inspection.service';
import { SupplierIdentityService } from '~/modules/supplier-identity';
import { logApiError } from '~/utils/api-logger';
import { BusinessError } from '~/utils/business-error';
import { buildGovernedCanonicalWritePairForTable } from '~/utils/governed-write';
import { parseNonEmptyArray } from '~/utils/request-validation';
import {
  badRequestResponse,
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';
import { resolveTeamIdForWrite } from '~/utils/team-resolver';

const DEFAULT_INSPECTION_CATEGORY = 'PROCESS';
const INSPECTION_CATEGORIES = new Set(['INCOMING', 'PROCESS', 'SHIPMENT']);
type InspectionCategory = 'INCOMING' | 'PROCESS' | 'SHIPMENT';

function normalizeInspectionCategory(value: unknown): InspectionCategory {
  const normalized = String(value ?? '')
    .trim()
    .toUpperCase();
  return INSPECTION_CATEGORIES.has(normalized)
    ? (normalized as InspectionCategory)
    : DEFAULT_INSPECTION_CATEGORY;
}

async function prepareIdentityImportPayload(
  item: Record<string, unknown>,
  category: InspectionCategory,
) {
  if (category === 'INCOMING') {
    const identity = await buildGovernedCanonicalWritePairForTable(
      'inspections',
      item,
      { mode: 'legacy-import' },
    );
    const supplierId = String(
      identity.supplierId || item.supplierId || '',
    ).trim();
    const supplier =
      await SupplierIdentityService.resolveSupplierById(supplierId);
    if (!supplier) {
      throw new BusinessError(
        'SUPPLIER_ID_REQUIRED',
        'A canonical supplier identity is required for incoming inspections',
      );
    }
    return { supplierId: supplier.id, supplierName: supplier.name };
  }
  if (category === 'PROCESS') {
    const teamId = await resolveTeamIdForWrite({
      explicitTeamId: String(item.teamId || '').trim() || undefined,
      team: String(item.team || '').trim(), // governance-allow-direct-name-id
    });
    const team = await SupplierIdentityService.resolveTeamById(teamId);
    if (!team) {
      throw new BusinessError(
        'TEAM_ID_REQUIRED',
        'A canonical TEAM identity is required for process inspections',
      );
    }
    return { team: team.name, teamId: team.id };
  }
  return {};
}

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event);
    const items = parseNonEmptyArray<Record<string, unknown>>(body.items);
    const { category } = body;

    if (!items) {
      return badRequestResponse(event, '未发现可导入的数据');
    }

    const normalizedCategory = normalizeInspectionCategory(category);
    let successCount = 0;
    const rowErrors = [];
    for (const [index, item] of items.entries()) {
      try {
        const itemCategory = normalizeInspectionCategory(
          item.category ?? normalizedCategory,
        );
        const identity = await prepareIdentityImportPayload(item, itemCategory);
        const payload = {
          ...item,
          category: itemCategory,
          ...identity,
        } as Parameters<typeof InspectionService.create>[0];
        await InspectionService.create(payload);
        successCount++;
      } catch (error) {
        logApiError('records-import-item', error, undefined, event);
        const message = toImportErrorMessage(error);
        rowErrors.push(
          buildImportRowError({
            field: inferImportErrorField(message),
            item,
            keyField: 'serialNumber',
            reason: message,
            row: index + 1,
          }),
        );
      }
    }

    return useResponseSuccess(
      buildImportSummary({
        rowErrors,
        successCount,
        totalCount: items.length,
      }),
    );
  } catch (error: unknown) {
    logApiError('records-import', error, undefined, event);
    return internalServerErrorResponse(event, '数据解析失败');
  }
});
