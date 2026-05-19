export function normalizeInspectionIssueString(
  value: unknown,
): string | undefined {
  const normalized = String(Array.isArray(value) ? value[0] : (value ?? ''))
    .trim()
    .replaceAll(/\s+/g, ' ');
  return normalized || undefined;
}

export function normalizeOptionalInspectionIssueString(
  value: unknown,
): string | undefined {
  const normalized = normalizeInspectionIssueString(value);
  if (!normalized) {
    return undefined;
  }
  return normalized;
}

export function normalizeOptionalInspectionIssueNumber(
  value: unknown,
): number | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }
  return parsed;
}

export function normalizeOptionalInspectionIssueDate(
  value: unknown,
): Date | undefined {
  const normalized = normalizeOptionalInspectionIssueString(value);
  if (!normalized) {
    return undefined;
  }
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }
  return parsed;
}

export function hasInspectionIssueAdminAccess(roles: unknown): boolean {
  if (!Array.isArray(roles)) {
    return false;
  }

  const normalizedRoles = roles
    .map((role) => normalizeOptionalInspectionIssueString(role)?.toLowerCase())
    .filter(Boolean) as string[];

  return normalizedRoles.some(
    (role) => role === 'admin' || role === 'super' || role === 'super admin',
  );
}

export function hasInspectionIssueWriteAccess(params: {
  inspector: null | string;
  roles: unknown;
  username: unknown;
}): boolean {
  const isAdmin = hasInspectionIssueAdminAccess(params.roles);
  const isOwner = params.inspector === String(params.username ?? '');
  return isAdmin || isOwner;
}
