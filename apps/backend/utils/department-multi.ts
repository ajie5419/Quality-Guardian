export function parseResponsibleDepartments(
  raw: null | string | undefined,
): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [raw];
  } catch {
    return raw ? [raw] : [];
  }
}

export function serializeResponsibleDepartments(
  departments: null | string | string[] | undefined,
): null | string {
  if (!departments) return null;
  if (typeof departments === 'string') return JSON.stringify([departments]);
  if (Array.isArray(departments) && departments.length > 0) {
    return JSON.stringify(departments);
  }
  return null;
}
