import type { EventHandlerRequest, H3Event } from 'h3';

import { getHeader } from 'h3';
import { renderAuditTemplateText } from '~/constants/audit-templates';
import { SystemLogService } from '~/services/system-log.service';

import { logApiError } from './api-logger';

type AuditAction = 'CREATE' | 'DELETE' | 'EXPORT' | 'READ' | 'UPDATE';

interface BusinessAuditLogParams {
  action: AuditAction;
  details?: string;
  detailsTemplate?: string;
  detailsVariables?: Record<string, unknown>;
  targetId: string;
  targetType: string;
  userId?: number | string;
}

function resolveRequestIp(event: H3Event<EventHandlerRequest>) {
  const forwardedFor = getHeader(event, 'x-forwarded-for');
  const realIp = getHeader(event, 'x-real-ip');
  const socketIp = event.node.req.socket.remoteAddress;
  return String(forwardedFor || realIp || socketIp || 'Unknown')
    .split(',')[0]
    .trim();
}

export async function recordBusinessAuditLog(
  event: H3Event<EventHandlerRequest>,
  params: BusinessAuditLogParams,
) {
  if (params.userId === undefined || params.userId === null) return;
  const details =
    params.detailsTemplate === undefined
      ? params.details || ''
      : renderAuditTemplateText(
          params.detailsTemplate,
          params.detailsVariables || {},
        );

  try {
    await SystemLogService.recordAuditLog({
      action: params.action,
      details,
      ipAddress: resolveRequestIp(event),
      targetId: params.targetId,
      targetType: params.targetType,
      userAgent: getHeader(event, 'user-agent') || 'Unknown',
      userId: String(params.userId),
    });
  } catch (error) {
    logApiError('audit-log', error);
  }
}
