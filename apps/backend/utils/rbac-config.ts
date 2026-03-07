import process from 'node:process';

function parseBooleanEnv(name: string, defaultValue: boolean) {
  const raw = process.env[name];
  if (raw === undefined) return defaultValue;
  const value = raw.trim().toLowerCase();
  return value === '1' || value === 'true' || value === 'yes';
}

export function isRbacReadV2Enabled() {
  return parseBooleanEnv('RBAC_READ_V2', false);
}

export function isDataScopeV2Enabled() {
  return parseBooleanEnv('DATA_SCOPE_V2', false);
}

export function isRbacSuperMergeAllCodesEnabled() {
  return parseBooleanEnv('RBAC_SUPER_MERGE_ALL_CODES', true);
}
