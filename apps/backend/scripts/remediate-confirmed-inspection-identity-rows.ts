import process from 'node:process';

import { createModuleLogger } from '~/utils/logger';
import prisma from '~/utils/prisma';

const logger = createModuleLogger('confirmed-inspection-identity-remediation');

type Mode = 'apply' | 'dry-run';

function parseOptions(args: string[]): { mode: Mode } {
  return { mode: args.includes('--apply') ? 'apply' : 'dry-run' };
}

type Correction =
  | {
      expectedSupplierId: string;
      expectedTeamId: string;
      inspectionId: string;
      kind: 'update-supplier';
      setSupplierId: string;
      setSupplierName: string;
      workOrderNumber: string;
    }
  | {
      inspectionId: string;
      kind: 'soft-delete';
      workOrderNumber: string;
    };

/**
 * Confirmed legacy corrections reviewed by the business owner. Each correction
 * is guarded by the exact current snapshot so a changed row is never touched.
 */
const CONFIRMED_CORRECTIONS: Correction[] = [
  {
    kind: 'update-supplier',
    inspectionId: 'cmlapxxvx0015pe01vtrxh0f3',
    workOrderNumber: '25TL-CL-2645',
    expectedSupplierId: 'SUP-1769076084955-rlsb',
    expectedTeamId: '0e9b4241568311f1881c00163e37355f',
    setSupplierId: 'SUP-1769076104309-6h4o',
    setSupplierName: '秦皇岛中通机械制造有限公司',
  },
  {
    kind: 'soft-delete',
    inspectionId: 'cml7u909d005vqw0135haaavi',
    workOrderNumber: '25TL-CL-2642',
  },
  {
    kind: 'soft-delete',
    inspectionId: 'cmqx3bnua003vpi011wt4nctz',
    workOrderNumber: '26TL-CLZL-001',
  },
];

export async function remediateConfirmedInspectionIdentityRows(options: {
  mode: Mode;
}) {
  const applied: Array<{ correction: string; count: number }> = [];
  for (const correction of CONFIRMED_CORRECTIONS) {
    if (correction.kind === 'update-supplier') {
      const result =
        options.mode === 'apply'
          ? await prisma.inspections.updateMany({
              where: {
                id: correction.inspectionId,
                isDeleted: false,
                supplierId: correction.expectedSupplierId,
                teamId: correction.expectedTeamId,
                workOrderNumber: correction.workOrderNumber,
              },
              data: {
                supplierId: correction.setSupplierId,
                supplierName: correction.setSupplierName,
              },
            })
          : { count: 1 };
      applied.push({
        correction: `update-supplier:${correction.inspectionId}`,
        count: result.count,
      });
      continue;
    }
    const result =
      options.mode === 'apply'
        ? await prisma.inspections.updateMany({
            where: {
              id: correction.inspectionId,
              isDeleted: false,
              workOrderNumber: correction.workOrderNumber,
            },
            data: { isDeleted: true },
          })
        : { count: 1 };
    applied.push({
      correction: `soft-delete:${correction.inspectionId}`,
      count: result.count,
    });
  }
  const summary = { applied, mode: options.mode };
  logger.info(summary, 'confirmed inspection identity remediation finished');
  return summary;
}

async function run() {
  const options = parseOptions(process.argv.slice(2));
  try {
    await remediateConfirmedInspectionIdentityRows(options);
  } finally {
    await prisma.$disconnect();
  }
}

void run().catch((error: unknown) => {
  logger.fatal(
    { err: error },
    'confirmed inspection identity remediation failed',
  );
  process.exitCode = 1;
});
