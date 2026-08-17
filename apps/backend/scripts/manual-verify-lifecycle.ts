// 手动验证数据生命周期归档（运维工具，可重复执行）
// 用法：
//   tsx scripts/manual-verify-lifecycle.ts --dry-run   # 只统计不动数据（安全）
//   tsx scripts/manual-verify-lifecycle.ts --demo      # 构造演示数据→执行→验证→自动还原
//   tsx scripts/manual-verify-lifecycle.ts             # 真实执行（等同 cron 行为）
import process from 'node:process';

import { runLifecycleArchive } from '~/modules/data-lifecycle';
import { createModuleLogger } from '~/utils/logger';
import prisma from '~/utils/prisma';

const logger = createModuleLogger('ManualLifecycleVerify');

async function dryRun(now: Date) {
  logger.info('==== 干跑：统计将归档/清理的数据（不动数据） ====');
  for (const table of [
    'quality_records',
    'inspections',
    'qms_inspection_requests',
  ]) {
    const client = (prisma as any)[table];
    const due = await client.count({
      where: {
        archivedAt: null,
        retainUntil: { not: null, lt: now },
        isDeleted: false,
      },
    });
    const marked = await client.count({ where: { archivedAt: { not: null } } });
    logger.info(`  ${table}: 到期未归档 ${due} 条, 已归档 ${marked} 条`);
  }
  const rule = await prisma.data_retention_rules.findUnique({
    where: { dataClass: 'snapshot' },
    select: { retentionDays: true },
  });
  const cutoff = new Date(
    now.getTime() - (rule?.retentionDays ?? 730) * 24 * 60 * 60 * 1000,
  );
  for (const entry of [
    { table: 'quality_loss_index', dateColumn: 'indexedAt' },
    { table: 'supplier_score_snapshots', dateColumn: 'createdAt' },
  ]) {
    const client = (prisma as any)[entry.table];
    const expired = await client.count({
      where: { [entry.dateColumn]: { lt: cutoff }, isDeleted: false },
    });
    logger.info(
      `  ${entry.table}: 超期(${cutoff.toISOString().slice(0, 10)} 前) ${expired} 条`,
    );
  }
  logger.info('（干跑完成，未改动任何数据）');
}

async function demo(now: Date) {
  logger.info('==== 演示：构造 → 执行 → 验证 → 还原 ====');
  // 1. 构造一条 retainUntil 已过期的检验记录
  const sample = await prisma.quality_records.findFirst({
    where: { isDeleted: false },
  });
  if (!sample) {
    logger.info('无可用检验记录，跳过演示');
    return;
  }
  await prisma.quality_records.update({
    where: { id: sample.id },
    data: { retainUntil: new Date(Date.now() - 60 * 1000) },
  });
  logger.info(`  ① 已构造过期记录: ${sample.id}（retainUntil 设为 1 分钟前）`);

  // 2. 执行归档
  const result = await runLifecycleArchive(now);
  logger.info(
    `  ② 归档执行结果: archived=${result.archived} deletedSnapshots=${result.deletedSnapshots}`,
  );

  // 3. 验证打标记
  const row = await prisma.quality_records.findUnique({
    where: { id: sample.id },
  });
  const ok = row?.archivedAt !== null && row?.archivedAt !== undefined;
  logger.info(
    `  ③ 验证归档标记: ${ok ? 'PASS ✓' : 'FAIL ✗'}（archivedAt=${row?.archivedAt?.toISOString() ?? 'null'}）`,
  );

  // 4. 还原（恢复测试数据原状）
  await prisma.quality_records.update({
    where: { id: sample.id },
    data: { archivedAt: null, retainUntil: null },
  });
  logger.info('  ④ 已还原测试数据（archivedAt/retainUntil 置空）');
  logger.info(`  演示${ok ? '通过' : '失败'}${ok ? ' ✅' : ' ❌'}`);
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const now = new Date();
  logger.info('数据生命周期归档验证 — 当前时间:', now.toISOString());
  if (args.has('--dry-run')) {
    await dryRun(now);
    return;
  }
  if (args.has('--demo')) {
    await demo(now);
    return;
  }
  logger.info('==== 真实执行（等同 cron data-lifecycle.daily-archive） ====');
  const result = await runLifecycleArchive(now);
  logger.info(
    `结果: 归档 ${result.archived} 条, 清理快照 ${result.deletedSnapshots} 条`,
  );
}

void main().catch((error: unknown) => {
  logger.fatal({ err: error }, 'lifecycle verify failed');
  process.exitCode = 1;
});

void prisma.$disconnect();
