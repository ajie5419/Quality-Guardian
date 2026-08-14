import { Prisma } from '@prisma/client';
import { BusinessError } from '~/utils/business-error';
import { createModuleLogger } from '~/utils/logger';

type NcNumberTransaction = Prisma.TransactionClient;

const logger = createModuleLogger('InspectionIssueNcNumber');

/**
 * Reserves a formal NC number inside the caller's write transaction.
 *
 * MySQL's INSERT ... ON DUPLICATE KEY UPDATE and following UPDATE both lock
 * the same sequence row. This avoids snapshot-read races when the row is
 * first created under MySQL's default repeatable-read isolation level.
 */
export async function reserveInspectionIssueNcNumber(
  tx: NcNumberTransaction,
): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `NC-${String(year).slice(-2)}KJ-`;
  const name = `inspection_issue_nc_${year}`;
  const latestRows = await tx.$queryRaw<
    Array<{ value: bigint | null | number }>
  >(
    Prisma.sql`
      SELECT MAX(CAST(SUBSTRING(nonConformanceNumber, ${prefix.length + 1}) AS UNSIGNED)) AS value
      FROM quality_records
      WHERE nonConformanceNumber LIKE ${`${prefix}%`}
    `,
  );
  const historicalMaximum = Number(latestRows[0]?.value ?? 0);
  const floor = Number.isSafeInteger(historicalMaximum)
    ? Math.max(0, historicalMaximum)
    : 0;

  try {
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO sequences (name, currentValue, prefix)
      VALUES (${name}, ${floor}, ${prefix})
      ON DUPLICATE KEY UPDATE
        currentValue = GREATEST(currentValue, VALUES(currentValue))
    `);
    await tx.$executeRaw(Prisma.sql`
      UPDATE sequences
      SET currentValue = currentValue + 1
      WHERE name = ${name}
    `);
    const sequenceRows = await tx.$queryRaw<
      Array<{ currentValue: bigint | number }>
    >(Prisma.sql`
      SELECT currentValue
      FROM sequences
      WHERE name = ${name}
      FOR UPDATE
    `);
    const currentValue = Number(sequenceRows[0]?.currentValue);
    if (!Number.isSafeInteger(currentValue) || currentValue < 1) {
      throw new BusinessError('CONFLICT', '不合格项编号生成失败，请重试', 409);
    }
    return `${prefix}${String(currentValue).padStart(3, '0')}`;
  } catch (error) {
    logger.error(error, 'inspection issue NC number reservation failed');
    throw error;
  }
}
