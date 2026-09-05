import type { AggregateIdentity } from './work-order-aggregate-identity';

import { createModuleLogger } from '~/utils/logger';

const logger = createModuleLogger('WorkOrderAggregateUtils');

export type AggregateAttachment = { name?: string; type?: string; url: string };
export type ProcessProgressGroup = {
  latestDate: Date;
  part: AggregateIdentity;
  processStats: Map<
    string,
    {
      completedQuantity: number;
      latestDate: Date;
      process: AggregateIdentity;
    }
  >;
  teams: Map<string, AggregateIdentity>;
  totalQuantity: number;
};

export function getTodayRange() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setHours(23, 59, 59, 999);
  return { end, start };
}

export function parseRequirementItems(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw !== 'string' || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    logger.error('Invalid requirement items JSON; treating as empty');
    return [];
  }
}

export function resolveRequirementPoints(requirementItems: unknown) {
  const parsed = parseRequirementItems(requirementItems);
  return parsed.length > 0 ? parsed.length : 1;
}

export function compactAggregateAttachments(
  attachments: Array<AggregateAttachment & { thumbUrl?: string }>,
): AggregateAttachment[] {
  return attachments.map(({ name, type, url }) => ({ name, type, url }));
}
