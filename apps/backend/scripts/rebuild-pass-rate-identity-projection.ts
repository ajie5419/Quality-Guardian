import process from 'node:process';

import { IdentityProjectionService } from '~/modules/master-data-identity';
import { PassRateProjectionService } from '~/modules/report';

export async function rebuildPassRateIdentityProjection() {
  const staged = await IdentityProjectionService.createStagedGeneration();
  const passRateProjection = await PassRateProjectionService.buildGeneration(
    staged.generationId,
  );
  const publication =
    await IdentityProjectionService.publishStagedGeneration(staged);
  if (!publication.published) {
    throw new Error(`IDENTITY_PROJECTION_PUBLISH_FAILED:${publication.reason}`);
  }
  return { ...staged, ...passRateProjection, ...publication };
}

if (process.argv[1]?.endsWith('rebuild-pass-rate-identity-projection.ts')) {
  void rebuildPassRateIdentityProjection().then((summary) => {
    process.stdout.write(`${JSON.stringify(summary)}\n`);
  });
}
