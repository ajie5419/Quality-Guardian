import {
  mapInspectionToPassRateBucket,
  mapProcessToPassRateBucket,
  parsePassRateIdentityBindings,
} from '@qgs/shared';
import prisma from '~/utils/prisma';

const SETTING_KEY = 'QMS_PASS_RATE_BUCKET_IDENTITIES';

export interface PassRateIdentityBootstrapResult {
  processBindings: number;
  unresolvedProcesses: number;
  unresolvedTeams: number;
  teamBindings: number;
}

export async function bootstrapPassRateIdentityBindings(): Promise<PassRateIdentityBootstrapResult> {
  const [setting, processes, teams] = await Promise.all([
    prisma.system_settings.findUnique({
      where: { key: SETTING_KEY },
      select: { value: true },
    }),
    prisma.processes.findMany({
      where: { isDeleted: false, status: 1 },
      select: { id: true, name: true },
    }),
    prisma.dictionaries.findMany({
      where: {
        dictType: 'team',
        isDeleted: false,
        status: 1,
      },
      select: { dictKey: true, id: true },
    }),
  ]);
  const bindings = parsePassRateIdentityBindings(
    setting?.value ? JSON.parse(setting.value) : {},
  );
  let unresolvedProcesses = 0;
  let unresolvedTeams = 0;

  for (const process of processes) {
    if (bindings.processIds[process.id]) continue;
    const bucket = mapProcessToPassRateBucket(process.name);
    if (bucket) bindings.processIds[process.id] = bucket;
    else unresolvedProcesses += 1;
  }
  for (const team of teams) {
    if (bindings.teamIds[team.id]) continue;
    const bucket = mapInspectionToPassRateBucket({
      processName: null,
      team: team.dictKey,
    });
    if (bucket) bindings.teamIds[team.id] = bucket;
    else unresolvedTeams += 1;
  }

  await prisma.system_settings.upsert({
    where: { key: SETTING_KEY },
    update: { value: JSON.stringify(bindings), updatedAt: new Date() },
    create: {
      description:
        'Stable TEAM and process identity bindings for QMS pass-rate buckets',
      key: SETTING_KEY,
      value: JSON.stringify(bindings),
    },
  });

  return {
    processBindings: Object.keys(bindings.processIds).length,
    teamBindings: Object.keys(bindings.teamIds).length,
    unresolvedProcesses,
    unresolvedTeams,
  };
}
