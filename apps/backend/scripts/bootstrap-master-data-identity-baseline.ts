import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';

import { MASTER_DATA_IDENTITY_BASELINE_KEY } from '~/modules/report';
import prisma from '~/utils/prisma';

type BaselineDocument = { contentChecksum?: unknown };

export async function bootstrapMasterDataIdentityBaseline() {
  const file = resolve(
    process.cwd(),
    '../../docs/baselines/master-data-identity-2026-08-01.json',
  );
  const baseline = JSON.parse(await readFile(file, 'utf8')) as BaselineDocument;
  const checksum = String(baseline.contentChecksum || '').trim();
  if (!checksum) throw new Error('BASELINE_CHECKSUM_REQUIRED');
  await prisma.system_settings.upsert({
    where: { key: MASTER_DATA_IDENTITY_BASELINE_KEY },
    create: {
      key: MASTER_DATA_IDENTITY_BASELINE_KEY,
      value: checksum,
      description: 'Immutable master data identity baseline checksum',
    },
    update: { value: checksum },
  });
  return { checksum };
}

if (process.argv[1]?.endsWith('bootstrap-master-data-identity-baseline.ts')) {
  void bootstrapMasterDataIdentityBaseline().then((summary) => {
    process.stdout.write(`${JSON.stringify(summary)}\n`);
  });
}
