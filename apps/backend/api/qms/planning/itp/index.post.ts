import { defineEventHandler, readBody } from 'h3';
import {
  buildGovernedCanonicalWritePairForTable,
  buildGovernedWriteFieldsForTable,
} from '~/utils/master-data-governance-write';
import { logApiError } from '~/utils/api-logger';
import { recordBusinessAuditLog } from '~/utils/audit-log';
import { awaitMockDelay } from '~/utils/index';
import {
  buildItpItemCreateData,
  getMaxItpItemOrder,
  normalizeItpText,
  parseItpQuantitativeItems,
} from '~/utils/itp';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import { getMissingRequiredFields } from '~/utils/request-validation';
import {
  badRequestResponse,
  internalServerErrorResponse,
  notFoundResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  await awaitMockDelay();
  const userinfo = verifyAccessToken(event);
  const body = await readBody(event);
  const projectId = normalizeItpText(body.projectId);
  const itemData = body as Record<string, unknown>;

  const missingFields = getMissingRequiredFields({ projectId }, ['projectId']);
  if (missingFields.length > 0) {
    return badRequestResponse(event, `${missingFields[0]} is required`);
  }

  try {
    const plan = await prisma.quality_plans.findUnique({
      where: { id: projectId },
      include: { items: true },
    });

    if (!plan) {
      return notFoundResponse(event, 'Quality plan not found');
    }

    const maxOrder = getMaxItpItemOrder(plan.items || []);

    const createData = buildItpItemCreateData({
      item: itemData,
      order: Number(itemData.order) || maxOrder + 1,
      projectId: String(projectId),
    });
    const governedCanonicalIds = await buildGovernedCanonicalWritePairForTable(
      'itp_items',
      createData as Record<string, unknown>,
    );
    const governedFields = buildGovernedWriteFieldsForTable(
      'itp_items',
      createData as Record<string, unknown>,
    );
    const newItem = await prisma.itp_items.create({
      data: {
        ...createData,
        ...governedFields,
        ...governedCanonicalIds,
      },
    });

    await recordBusinessAuditLog(event, {
      userId: userinfo?.id,
      action: 'CREATE',
      targetType: 'planning_itp_item',
      targetId: String(newItem.id),
      detailsTemplate: '新增 ITP 条目: {{item}}',
      detailsVariables: {
        item: newItem.processStep || newItem.activity || newItem.id,
      },
    });

    return useResponseSuccess({
      ...newItem,
      quantitativeItems: parseItpQuantitativeItems(newItem.quantitativeItems),
    });
  } catch (error) {
    logApiError('itp', error, undefined, event);
    return internalServerErrorResponse(event, '创建 ITP 条目失败');
  }
});
