import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '~/utils/prisma';

import {
  DEFAULT_RETENTION_RULES,
  ensureDefaultRetentionRules,
} from './data-retention-rule.service';

vi.mock('~/utils/prisma', () => ({
  default: {
    data_retention_rules: {
      createMany: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
  },
}));

describe('data retention rule service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('ensures default rules only for missing data classes', async () => {
    vi.mocked(prisma.data_retention_rules.findMany).mockResolvedValue([
      { dataClass: 'audit-log' } as never,
    ]);
    vi.mocked(prisma.data_retention_rules.createMany).mockResolvedValue({
      count: DEFAULT_RETENTION_RULES.length - 1,
    } as never);

    await ensureDefaultRetentionRules();

    expect(prisma.data_retention_rules.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          dataClass: 'inspection-record',
          retentionDays: 3650,
        }),
      ]),
      skipDuplicates: true,
    });
    // audit-log 已存在，不在 createMany 数据里
    const data = vi.mocked(prisma.data_retention_rules.createMany).mock
      .calls[0]?.[0]?.data as Array<{ dataClass: string }>;
    expect(data.some((rule) => rule.dataClass === 'audit-log')).toBe(false);
  });

  it('skips seeding when all rules exist (idempotent)', async () => {
    vi.mocked(prisma.data_retention_rules.findMany).mockResolvedValue(
      DEFAULT_RETENTION_RULES.map(
        (rule) => ({ dataClass: rule.dataClass }) as never,
      ),
    );

    await ensureDefaultRetentionRules();

    expect(prisma.data_retention_rules.createMany).not.toHaveBeenCalled();
  });
});
