import { PlanningBomService } from '~/modules/planning';
import { WorkOrderService } from '~/modules/work-order';
import { BusinessError } from '~/utils/business-error';

function requiredText(value: unknown, fieldName: string) {
  const normalized = String(value ?? '').trim();
  if (!normalized) {
    throw new BusinessError('VALIDATION', `缺少必填字段: ${fieldName}`);
  }
  return normalized;
}

export async function resolveManualQualityLossContext(
  body: Record<string, unknown>,
) {
  const workOrderNumber = requiredText(body.workOrderNumber, 'workOrderNumber');
  const partName = requiredText(body.partName, 'partName');
  const partId = String(body.partId ?? '').trim() || null;

  const workOrder =
    await WorkOrderService.findQualityLossReference(workOrderNumber);
  if (!workOrder) {
    throw new BusinessError('WORK_ORDER_NOT_FOUND', '工单不存在或已删除', 404);
  }
  const projectName = String(workOrder.projectName ?? '').trim();
  if (!projectName) {
    throw new BusinessError(
      'WORK_ORDER_PROJECT_MISSING',
      '所选工单未配置项目名称，请先维护工单',
    );
  }

  const part = await PlanningBomService.findPartReference({
    partId,
    partName,
    workOrderNumber,
  });
  if (!part) {
    throw new BusinessError('BOM_PART_NOT_FOUND', '所选部件不属于该工单的 BOM');
  }

  return {
    partId: part.partId,
    partName: part.part_name,
    projectId: workOrder.projectId,
    projectName,
    workOrderNumber: workOrder.workOrderNumber,
  };
}
